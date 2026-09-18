(function () {
  "use strict";

  const statusNode = document.getElementById("status");
  const listNode = document.getElementById("book-list");
  const refreshButton = document.getElementById("refresh-button");
  const librarySelect = document.getElementById("library-filter");
  const monthStartSlider = document.getElementById("month-filter-start");
  const monthEndSlider = document.getElementById("month-filter-end");
  const monthValue = document.getElementById("month-filter-value");
  const monthRangeInputs = document.querySelector(".month-range-inputs");
  const supportsIntersectionObserver = typeof IntersectionObserver !== "undefined";

  let libraries = [];
  let activeConfig = window.SRU_CONFIG;
  let activeFilterLabel = "";
  let pager = null;
  let observer = null;
  let sentinelNode = null;
  let isLoadingNextPage = false;
  let totalLoaded = 0;
  let activeMonthCode = "";

  function setControlsDisabled(disabled) {
    librarySelect.disabled = disabled;
    monthStartSlider.disabled = disabled;
    monthEndSlider.disabled = disabled;
    refreshButton.disabled = disabled;
  }

  function formatMonthOffset(offset) {
    const today = new Date();
    const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);

    return new Intl.DateTimeFormat("de-CH", {
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function getMonthRange() {
    return {
      start: Number(monthStartSlider.value) || 0,
      end: Number(monthEndSlider.value) || 0
    };
  }

  function getMonthRangeLabel() {
    const { start, end } = getMonthRange();
    const startLabel = formatMonthOffset(start);
    return start === end ? startLabel : `${startLabel} – ${formatMonthOffset(end)}`;
  }

  function updateMonthRange(changedSlider) {
    let { start, end } = getMonthRange();

    if (start > end) {
      if (changedSlider === monthStartSlider) {
        end = start;
        monthEndSlider.value = String(end);
      } else {
        start = end;
        monthStartSlider.value = String(start);
      }
    }

    const label = getMonthRangeLabel();
    monthValue.textContent = label;
    monthStartSlider.setAttribute("aria-valuetext", formatMonthOffset(start));
    monthEndSlider.setAttribute("aria-valuetext", formatMonthOffset(end));
    monthRangeInputs.style.setProperty("--range-start", `${(start / 11) * 100}%`);
    monthRangeInputs.style.setProperty("--range-end", `${(end / 11) * 100}%`);
  }

  function getSelectedLibrary() {
    return libraries.find((library) => library.scope === librarySelect.value) || null;
  }

  function buildRequestConfig() {
    const selectedLibrary = getSelectedLibrary();
    const monthRange = getMonthRange();
    const filterCode = selectedLibrary
      ? selectedLibrary.filterShort || selectedLibrary.short
      : "*";

    return {
      ...window.SRU_CONFIG,
      searchScope: selectedLibrary ? selectedLibrary.scope : "",
      tab: selectedLibrary ? selectedLibrary.scope : "",
      accessionPrefix: `NEL${filterCode}`,
      recentMonthStartOffset: monthRange.start,
      recentMonthCount: monthRange.end - monthRange.start + 1
    };
  }

  function createFilterLabel() {
    const selectedLibrary = getSelectedLibrary();
    const libraryName = selectedLibrary
      ? selectedLibrary.name
      : "Alle Bibliotheken (ABN)";
    return `${libraryName}, ${getMonthRangeLabel()}`;
  }

  function clearObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function removeSentinel() {
    if (sentinelNode) {
      sentinelNode.remove();
      sentinelNode = null;
    }
  }

  function setSentinel(message) {
    removeSentinel();

    const sentinel = document.createElement("li");
    sentinel.className = "book-item book-sentinel";
    sentinel.textContent = message;
    listNode.appendChild(sentinel);
    sentinelNode = sentinel;

    return sentinel;
  }

  function setLoadingStatus(pageNumber, loaded, total) {
    const totalHint = total > 0 ? ` von ${total}` : "";
    statusNode.textContent =
      `Neueingänge (${activeFilterLabel}): Seite ${pageNumber}, ${loaded}${totalHint} geladen.`;
  }

  function appendMonthHeading(monthCode, monthLabel) {
    if (!monthCode || monthCode === activeMonthCode) {
      return;
    }

    const item = document.createElement("li");
    item.className = "book-month-heading";

    const heading = document.createElement("h2");
    heading.textContent = monthLabel;
    item.appendChild(heading);
    listNode.appendChild(item);
    activeMonthCode = monthCode;
  }

  async function loadNextPage() {
    if (!pager || isLoadingNextPage) {
      return;
    }

    isLoadingNextPage = true;
    setControlsDisabled(true);
    removeSentinel();

    try {
      const page = await pager.loadNextPage();

      if (!page.records.length && page.totalLoaded === 0) {
        listNode.innerHTML = '<li class="book-item">Keine neuen Zugänge gefunden.</li>';
        statusNode.textContent = "Keine neuen Zugänge gefunden.";
        clearObserver();
        return;
      }

      appendMonthHeading(page.monthCode, page.monthLabel);
      window.LibrarySruWidget.appendBooks(listNode, page.records, activeConfig, totalLoaded);
      totalLoaded = page.totalLoaded;
      setLoadingStatus(page.pageNumber, page.totalLoaded, page.totalAvailable);

      if (page.hasMore) {
        if (supportsIntersectionObserver) {
          const sentinel = setSentinel("Nach unten scrollen, um weitere Datensätze zu laden...");
          observer.observe(sentinel);
        } else {
          statusNode.textContent = `${statusNode.textContent} Browser unterstützt kein automatisches Nachladen.`;
        }
      } else {
        statusNode.textContent =
          `${page.totalLoaded} Neueingänge geladen (${activeFilterLabel}).`;
        clearObserver();
      }
    } catch (error) {
      const details = error && error.message ? ` Details: ${error.message}` : "";
      statusNode.textContent =
        `Datensätze konnten nicht nachgeladen werden. Bitte erneut laden.${details}`;
      clearObserver();
      removeSentinel();
      console.error(error);
    } finally {
      isLoadingNextPage = false;
      setControlsDisabled(false);
    }
  }

  async function load() {
    activeConfig = buildRequestConfig();
    activeFilterLabel = createFilterLabel();
    statusNode.textContent = `Lade Neueingänge (${activeFilterLabel})...`;
    setControlsDisabled(true);
    clearObserver();
    removeSentinel();
    pager = null;
    totalLoaded = 0;
    activeMonthCode = "";
    listNode.innerHTML = "";

    try {
      pager = window.LibrarySruWidget.createPagedFetcher(activeConfig);

      if (supportsIntersectionObserver) {
        observer = new IntersectionObserver(
          (entries) => {
            const isVisible = entries.some((entry) => entry.isIntersecting);
            if (isVisible) {
              loadNextPage();
            }
          },
          { root: null, rootMargin: "280px 0px", threshold: 0 }
        );
      }

      await loadNextPage();
    } catch (error) {
      listNode.innerHTML = "";
      const details = error && error.message ? ` Details: ${error.message}` : "";
      statusNode.textContent =
        `Datensätze konnten nicht geladen werden. Bitte SRU-Endpunkt und CORS prüfen.${details}`;
      console.error(error);
    } finally {
      setControlsDisabled(false);
    }
  }

  function initializeFilters() {
    const dataNode = document.getElementById("library-data");
    const data = JSON.parse(dataNode?.textContent || "[]");
    libraries = data.filter(
      (library) => library.scope && library.short && library.name
    );

    if (libraries.length === 0) {
      throw new Error("Die Bibliotheksliste enthält keine gültigen Einträge.");
    }

    libraries.forEach((library) => {
      const option = document.createElement("option");
      option.value = library.scope;
      option.textContent = library.name;
      librarySelect.appendChild(option);
    });

    const configuredScope = window.SRU_CONFIG.searchScope || "";
    librarySelect.value = libraries.some((library) => library.scope === configuredScope)
      ? configuredScope
      : "";

    const configuredStartOffset = Math.min(
      11,
      Math.max(0, Number(window.SRU_CONFIG.recentMonthStartOffset) || 0)
    );
    const configuredMonthCount = Math.max(1, Number(window.SRU_CONFIG.recentMonthCount) || 1);
    const configuredEndOffset = Math.min(11, configuredStartOffset + configuredMonthCount - 1);
    monthStartSlider.value = String(configuredStartOffset);
    monthEndSlider.value = String(configuredEndOffset);
    updateMonthRange();
  }

  refreshButton.addEventListener("click", load);
  librarySelect.addEventListener("change", load);
  [monthStartSlider, monthEndSlider].forEach((slider) => {
    slider.addEventListener("input", () => updateMonthRange(slider));
    slider.addEventListener("change", load);
  });

  try {
    initializeFilters();
    load();
  } catch (error) {
    statusNode.textContent = error.message;
    listNode.innerHTML = "";
    console.error(error);
  }
})();