(function () {
  "use strict";

  function buildRecentMonthCodes(prefixes, monthCount, startOffset) {
    const codes = [];
    const today = new Date();
    const totalMonths = Math.max(monthCount || 0, 0);
    const firstOffset = Math.max(startOffset || 0, 0);

    for (let offset = firstOffset; offset < firstOffset + totalMonths; offset += 1) {
      const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
      const year = String(date.getFullYear()).slice(-2);
      const month = String(date.getMonth() + 1).padStart(2, "0");
      prefixes.forEach((prefix) => {
        codes.push(`${prefix}${year}${month}`);
      });
    }

    return codes;
  }

  function buildAccessionQuery(accessionPrefix, code) {
    return accessionPrefix.includes("*")
      ? `alma.local_field_990 all "${code}"`
      : `alma.local_field_990=${code}`;
  }

  function formatMonthLabel(code) {
    const match = code.match(/(\d{2})(\d{2})$/);
    if (!match) {
      return code;
    }

    const date = new Date(2000 + Number(match[1]), Number(match[2]) - 1, 1);
    return new Intl.DateTimeFormat("de-CH", {
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function resolveQuery(config) {
    let query = config.query;

    if (config.accessionPrefix) {
      const codes = buildRecentMonthCodes(
        [config.accessionPrefix],
        config.recentMonthCount || 1,
        config.recentMonthStartOffset || 0
      );
      const wildcard = config.accessionPrefix.includes("*");

      query = codes
        .map((code) => wildcard
          ? `alma.local_field_990 all "${code}"`
          : `alma.local_field_990=${code}`
        )
        .join(" or ");
    }

    return config.sortBy ? `${query} sortBy ${config.sortBy}` : query;
  }

  function readFirstByLocalName(parent, localName) {
    const node = Array.from(parent.getElementsByTagName("*")).find(
      (candidate) => candidate.localName === localName
    );
    return node ? node.textContent.trim() : "";
  }

  function readMarcSubfields(recordNode, tag, code) {
    return Array.from(recordNode.getElementsByTagName("*")).flatMap((candidate) => {
      if (candidate.localName !== "datafield" || candidate.getAttribute("tag") !== tag) {
        return [];
      }

      return Array.from(candidate.children)
        .filter(
          (subfield) => subfield.localName === "subfield" && subfield.getAttribute("code") === code
        )
        .map((subfield) => subfield.textContent.trim())
        .filter(Boolean);
    });
  }

  function parseLibraries(recordNode) {
    const avaFields = Array.from(recordNode.getElementsByTagName("*")).filter(
      (candidate) => candidate.localName === "datafield" && candidate.getAttribute("tag") === "AVA"
    );

    return Array.from(new Set(avaFields
      .map((fieldNode) => {
        const subfields = Array.from(fieldNode.children);
        const library = subfields.find(
          (subfield) => subfield.localName === "subfield" && subfield.getAttribute("code") === "q"
        );
        const fallback = subfields.find(
          (subfield) => subfield.localName === "subfield" && subfield.getAttribute("code") === "b"
        );

        return library?.textContent || fallback?.textContent || "";
      })
      .map(cleanCatalogText)
      .filter(Boolean)));
  }

  function readMarcJoinedSubfields(recordNode, tag, codes) {
    const values = [];

    Array.from(recordNode.getElementsByTagName("*")).forEach((candidate) => {
      if (candidate.localName !== "datafield" || candidate.getAttribute("tag") !== tag) {
        return;
      }

      codes.forEach((code) => {
        Array.from(candidate.children)
          .filter(
            (subfield) => subfield.localName === "subfield" && subfield.getAttribute("code") === code
          )
          .forEach((subfield) => {
            const value = subfield.textContent.trim();
            if (value) {
              values.push(value);
            }
          });
      });
    });

    return values.join(" ").trim();
  }

  function cleanCatalogText(value) {
    return (value || "")
      .replace(/<</g, "")
      .replace(/>>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanCreatorText(value) {
    return cleanCatalogText(value)
      .replace(/\b\d{4}-\d{0,4}\b/g, "")
      .replace(/\([^)]*\)$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildPublicationLine(place, publisher) {
    const cleanPlace = cleanCatalogText(place).replace(/[\[\]]/g, "").trim();
    const cleanPublisher = cleanCatalogText(publisher).replace(/[\[\]]/g, "").trim();

    if (cleanPlace && cleanPublisher) {
      return `${cleanPlace}: ${cleanPublisher}`;
    }

    return cleanPlace || cleanPublisher;
  }

  function normalizeDisplayDate(value) {
    const cleaned = cleanCatalogText(value);
    const years = Array.from(cleaned.matchAll(/(?:\[)?(\d{4})(?:\])?/g)).map((match) => match[1]);
    const uniqueYears = Array.from(new Set(years));

    if (uniqueYears.length > 0) {
      return uniqueYears[0];
    }

    return cleaned.replace(/[\[\]]/g, "").replace(/©/g, "").trim();
  }

  function normalizeIsbn(value) {
    const match = (value || "").toUpperCase().match(/(?:97[89][\d\s-]{10,16}|[\dX][\dX\s-]{8,15})/);
    if (!match) {
      return "";
    }

    const isbn = match[0].replace(/[^\dX]/g, "");
    return isbn.length === 10 || isbn.length === 13 ? isbn : "";
  }

  function parseMarcRecord(recordNode) {
    const title = cleanCatalogText(readMarcJoinedSubfields(recordNode, "245", ["a", "b"])) || "Ohne Titel";
    const creator =
      cleanCreatorText(readMarcJoinedSubfields(recordNode, "100", ["a", "d"])) ||
      cleanCreatorText(readMarcJoinedSubfields(recordNode, "110", ["a"])) ||
      cleanCreatorText(readMarcJoinedSubfields(recordNode, "111", ["a"])) ||
      cleanCreatorText(readMarcJoinedSubfields(recordNode, "700", ["a", "d"])) ||
      "Unbekannt";
    const publicationLine =
      buildPublicationLine(
        readMarcJoinedSubfields(recordNode, "264", ["a"]),
        readMarcJoinedSubfields(recordNode, "264", ["b"])
      ) ||
      buildPublicationLine(
        readMarcJoinedSubfields(recordNode, "260", ["a"]),
        readMarcJoinedSubfields(recordNode, "260", ["b"])
      );
    const dateSource =
      readMarcJoinedSubfields(recordNode, "264", ["c"]) ||
      readMarcJoinedSubfields(recordNode, "260", ["c"]);
    const date = normalizeDisplayDate(dateSource) || "Ohne Erscheinungsjahr";
    const summary =
      readMarcJoinedSubfields(recordNode, "520", ["a"]) ||
      readMarcJoinedSubfields(recordNode, "505", ["a"]) ||
      readMarcJoinedSubfields(recordNode, "500", ["a"]);
    const libraries = parseLibraries(recordNode);
    const isbn = readMarcSubfields(recordNode, "020", "a")
      .map(normalizeIsbn)
      .find(Boolean) || "";

    return {
      title,
      creator,
      publicationLine,
      date,
      summary,
      libraries,
      isbn
    };
  }

  function parseDcRecord(recordNode) {
    const title = cleanCatalogText(readFirstByLocalName(recordNode, "title")) || "Ohne Titel";
    const creator = cleanCreatorText(readFirstByLocalName(recordNode, "creator")) || "Unbekannt";
    const date = normalizeDisplayDate(readFirstByLocalName(recordNode, "date")) || "Ohne Erscheinungsjahr";
    const summary = readFirstByLocalName(recordNode, "description");

    return {
      title,
      creator,
      publicationLine: "",
      date,
      summary,
      libraries: []
    };
  }

  function buildCatalogRecordUrl(book, config) {
    if (!book.recordIdentifier || !config.vid) {
      return "";
    }

    const params = new URLSearchParams({
      docid: `alma${book.recordIdentifier}`,
      context: "L",
      vid: config.vid,
      lang: "de"
    });

    if (config.searchScope) {
      params.set("search_scope", config.searchScope);
    }

    if (config.tab) {
      params.set("tab", config.tab);
    }

    return `https://abn.swisscovery.ch/discovery/fulldisplay?${params.toString()}`;
  }

  function createBookCover(book) {
    if (!book.isbn) {
      return null;
    }

    const cover = document.createElement("div");
    cover.className = "book-cover";
    cover.hidden = true;

    const image = document.createElement("img");
    image.className = "book-cover-image";
    image.alt = `Cover von ${book.title}`;
    image.decoding = "async";

    image.addEventListener("load", () => {
      if (image.naturalWidth <= 1 || image.naturalHeight <= 1) {
        cover.remove();
        return;
      }

      cover.hidden = false;
      cover.parentElement?.classList.remove("book-card-body-no-cover");
    });
    image.addEventListener("error", () => {
      cover.remove();
    });

    image.src = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(book.isbn)}-M.jpg`;
    cover.appendChild(image);
    return cover;
  }

  function createSummaryElements(summaryText) {
    const text = (summaryText || "").trim();
    if (!text) {
      return { summary: null, toggleButton: null };
    }

    const summary = document.createElement("p");
    summary.className = "book-summary";
    const previewLimit = 280;

    if (text.length <= previewLimit) {
      summary.textContent = text;
      return { summary, toggleButton: null };
    }

    const previewText = `${text.slice(0, previewLimit).trimEnd()} ...`;
    summary.textContent = previewText;
    summary.dataset.collapsedText = previewText;
    summary.dataset.expandedText = text;
    summary.dataset.expanded = "false";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "summary-toggle";
    toggleButton.textContent = "Mehr anzeigen";
    toggleButton.setAttribute("aria-expanded", "false");
    toggleButton.addEventListener("click", () => {
      const isExpanded = summary.dataset.expanded === "true";
      summary.dataset.expanded = isExpanded ? "false" : "true";
      summary.textContent = isExpanded
        ? summary.dataset.collapsedText
        : summary.dataset.expandedText;
      toggleButton.textContent = isExpanded ? "Mehr anzeigen" : "Weniger anzeigen";
      toggleButton.setAttribute("aria-expanded", isExpanded ? "false" : "true");
    });

    return { summary, toggleButton };
  }

  function encodeSruParams(config, startRecordOverride) {
    const params = new URLSearchParams({
      operation: "searchRetrieve",
      version: config.version,
      query: resolveQuery(config),
      recordSchema: config.recordSchema,
      maximumRecords: String(config.requestMaximumRecords ?? config.sruPageSize),
      startRecord: String(startRecordOverride || config.startRecord)
    });

    if (config.vid) {
      params.set("vid", config.vid);
    }

    if (config.searchScope) {
      params.set("search_scope", config.searchScope);
      params.set("scope", config.searchScope);
    }

    if (config.tab) {
      params.set("tab", config.tab);
    }

    return params.toString();
  }

  function parseSruResponse(xmlText) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");
    const parseError = xml.querySelector("parsererror");
    if (parseError) {
      throw new Error("Invalid XML response from SRU service.");
    }

    const diagnostics = Array.from(xml.getElementsByTagName("*")).filter(
      (candidate) => candidate.localName === "diagnostic"
    );

    if (diagnostics.length > 0) {
      const diagnosticMessages = diagnostics
        .map((diagnostic) => {
          const uri = readFirstByLocalName(diagnostic, "uri");
          const details =
            readFirstByLocalName(diagnostic, "details") ||
            readFirstByLocalName(diagnostic, "message") ||
            "Unbekannte SRU-Diagnose";

          return uri ? `${details} (${uri})` : details;
        })
        .filter(Boolean);

      throw new Error(
        `SRU-Diagnose: ${diagnosticMessages.join("; ") || "Unbekannter Fehler"}`
      );
    }

    const responseRecordNodes = Array.from(xml.getElementsByTagName("*")).filter(
      (candidate) => candidate.localName === "record" && candidate.parentElement?.localName === "records"
    );

    const records = responseRecordNodes.map((recordNode) => {
      const recordIdentifier = readFirstByLocalName(recordNode, "recordIdentifier");
      const payloadNode = Array.from(recordNode.getElementsByTagName("*")).find(
        (candidate) => candidate.parentElement?.localName === "recordData"
      );

      if (!payloadNode) {
        return {
          ...parseDcRecord(recordNode),
          recordIdentifier
        };
      }

      if (payloadNode.localName === "record") {
        return {
          ...parseMarcRecord(payloadNode),
          recordIdentifier
        };
      }

      return {
        ...parseDcRecord(payloadNode),
        recordIdentifier
      };
    });

    const numberOfRecords = Number(readFirstByLocalName(xml, "numberOfRecords") || "0");
    const nextRecordPosition = Number(readFirstByLocalName(xml, "nextRecordPosition") || "0");

    return {
      records,
      numberOfRecords,
      nextRecordPosition
    };
  }

  async function fetchSruPage(config, startRecord) {
    const url = `${config.endpoint}?${encodeSruParams(config, startRecord)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`SRU request failed with status ${response.status}`);
      }

      const xmlText = await response.text();
      return parseSruResponse(xmlText);
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`SRU request timeout after ${config.timeoutMs} ms (startRecord=${startRecord}).`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function createPagedFetcher(config) {
    const totalLimit = config.displayLimit > 0
      ? config.displayLimit
      : Number.POSITIVE_INFINITY;
    const pageSize = Math.max(1, config.sruPageSize || 50);
    const monthCodes = config.accessionPrefix
      ? buildRecentMonthCodes(
        [config.accessionPrefix],
        config.recentMonthCount || 1,
        config.recentMonthStartOffset || 0
      )
      : [];
    const aggregateQuery = monthCodes.length > 1 ? resolveQuery(config) : "";

    let nextStartRecord = config.startRecord || 1;
    let monthIndex = 0;
    let loadedCount = 0;
    let pageNumber = 0;
    let totalAvailable = 0;
    let hasAggregateTotal = false;
    let exhausted = false;
    const seenRecordIdentifiers = new Set();

    function getRequestConfig(requestMaximumRecords) {
      if (!monthCodes.length) {
        return { ...config, requestMaximumRecords };
      }

      return {
        ...config,
        accessionPrefix: "",
        query: buildAccessionQuery(config.accessionPrefix, monthCodes[monthIndex]),
        requestMaximumRecords
      };
    }

    async function loadAggregateTotal() {
      if (!aggregateQuery || hasAggregateTotal) {
        return;
      }

      const countPage = await fetchSruPage({
        ...config,
        accessionPrefix: "",
        query: aggregateQuery,
        requestMaximumRecords: 0
      }, config.startRecord || 1);

      totalAvailable = countPage.numberOfRecords;
      hasAggregateTotal = true;
    }

    async function loadNextPage() {
      if (exhausted || !nextStartRecord) {
        return {
          records: [],
          pageNumber,
          totalLoaded: loadedCount,
          totalAvailable,
          hasMore: false,
          nextRecordPosition: 0
        };
      }

      await loadAggregateTotal();

      const remaining = Number.isFinite(totalLimit)
        ? Math.max(totalLimit - loadedCount, 0)
        : pageSize;
      const requestMaximumRecords = Math.max(1, Math.min(pageSize, remaining || pageSize));
      const requestedStartRecord = nextStartRecord;
      const currentMonthCode = monthCodes[monthIndex] || "";
      const page = await fetchSruPage(
        getRequestConfig(requestMaximumRecords),
        requestedStartRecord
      );
      pageNumber += 1;

      const records = (page.records || []).filter((record) => {
        if (!record.recordIdentifier || !seenRecordIdentifiers.has(record.recordIdentifier)) {
          if (record.recordIdentifier) {
            seenRecordIdentifiers.add(record.recordIdentifier);
          }
          return true;
        }

        return false;
      });
      loadedCount += records.length;
      if (!aggregateQuery) {
        totalAvailable = page.numberOfRecords;
      }

      const hasServerNext = Boolean(
        page.nextRecordPosition && page.nextRecordPosition > requestedStartRecord
      );
      const reachedClientLimit = Number.isFinite(totalLimit) && loadedCount >= totalLimit;
      const hasLaterMonth = monthCodes.length > 0 && monthIndex < monthCodes.length - 1;
      const hasMore = !reachedClientLimit && (hasServerNext || hasLaterMonth);

      if (hasServerNext && !reachedClientLimit) {
        nextStartRecord = page.nextRecordPosition;
      } else if (hasLaterMonth && !reachedClientLimit) {
        monthIndex += 1;
        nextStartRecord = config.startRecord || 1;
      } else {
        nextStartRecord = 0;
      }
      exhausted = !hasMore;

      if (!records.length && hasMore) {
        return loadNextPage();
      }

      return {
        records,
        monthCode: currentMonthCode,
        monthLabel: currentMonthCode ? formatMonthLabel(currentMonthCode) : "",
        pageNumber,
        totalLoaded: loadedCount,
        totalAvailable,
        hasMore,
        nextRecordPosition: nextStartRecord
      };
    }

    return { loadNextPage };
  }

  function createBookListItem(book, index, config) {
    const li = document.createElement("li");
    li.className = "book-item";
    li.style.animationDelay = `${Math.min(index * 70, 420)}ms`;

    const cardBody = document.createElement("div");
    cardBody.className = "book-card-body";

    const content = document.createElement("div");
    content.className = "book-content";

    const title = document.createElement("h3");
    title.className = "book-title";

    const catalogUrl = buildCatalogRecordUrl(book, config || {});
    if (catalogUrl) {
      const titleLink = document.createElement("a");
      titleLink.className = "book-title-link";
      titleLink.href = catalogUrl;
      titleLink.target = "_blank";
      titleLink.rel = "noopener noreferrer";
      titleLink.textContent = book.title;
      title.appendChild(titleLink);
    } else {
      title.textContent = book.title;
    }

    const meta = document.createElement("p");
    meta.className = "book-meta";
    meta.textContent = book.creator;

    const publication = document.createElement("p");
    publication.className = "book-publication";
    publication.textContent = [book.publicationLine, book.date].filter(Boolean).join(" | ");

    const availability = document.createElement("p");
    availability.className = "book-availability";
    availability.textContent = book.libraries.length
      ? `Verfügbar in: ${book.libraries.join(", ")}`
      : "Verfügbar in: Keine Bibliotheksangabe";

    const { summary, toggleButton } = createSummaryElements(book.summary);

    content.appendChild(title);
    content.appendChild(meta);
    if (publication.textContent) {
      content.appendChild(publication);
    }
    content.appendChild(availability);
    if (summary) {
      content.appendChild(summary);
    }
    if (toggleButton) {
      content.appendChild(toggleButton);
    }

    const cover = createBookCover(book);
    if (cover) {
      cardBody.classList.add("book-card-body-no-cover");
      cardBody.appendChild(cover);
    } else {
      cardBody.classList.add("book-card-body-no-cover");
    }
    cardBody.appendChild(content);
    li.appendChild(cardBody);

    return li;
  }

  function appendBooks(container, books, config, startIndex) {
    books.forEach((book, offset) => {
      container.appendChild(createBookListItem(book, (startIndex || 0) + offset, config));
    });
  }

  window.LibrarySruWidget = {
    createPagedFetcher,
    appendBooks
  };
})();