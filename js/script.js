const params = new URLSearchParams(window.location.search);
const clientId = params.get("client") || "1001";
const CURRENT_HISTORY_YEAR = "2026";
let activeClient = null;

fetch("data/clients.json")
  .then(response => {
    if (!response.ok) {
      throw new Error("Не удалось загрузить clients.json");
    }
    return response.json();
  })
  .then(data => {
    const client = data[clientId];

    if (!client) {
      document.body.innerHTML =
        '<main class="page"><section class="section"><h1>Данные не найдены</h1><p>Проверьте ссылку или QR-код.</p></section></main>';
      return;
    }

    activeClient = client;

    renderHeroSummary(client);
    renderHeroServices(client.services || []);

    document.getElementById("account").innerText =
      "Лицевой счет: " + client.account;

    document.getElementById("amount").innerText = getCurrentMonthCharge(client);
    document.getElementById("debt").innerText = getTotalDebt(client);
    document.getElementById("penalty").innerText = client.penalty;

    renderMonthMap(client);
    renderDebtHistory(client);
    renderReadingHistory(client, CURRENT_HISTORY_YEAR, false);
    renderPaymentHistory(client, CURRENT_HISTORY_YEAR, false);
    renderRestriction(client);
    renderServices(client.services || []);
    renderTimeline(client.events || [], client);
    setupMailButton(client);
    applyStackSectionStates(client);
    setupStackedSections();
    setupHeroNavigation(client);
  })
  .catch(error => {
    console.error(error);
    document.body.innerHTML =
      '<main class="page"><section class="section"><h1>Ошибка загрузки данных</h1><p>Откройте страницу через Live Server и проверьте файл data/clients.json.</p></section></main>';
  });


function parseMoney(value) {
  const normalized = String(value || "0")
    .replace(/\s/g, "")
    .replace("₽", "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  return Number(normalized) || 0;
}


function paymentUrlFor(client) {
  const account = encodeURIComponent(client.account || "");
  return `https://lkfl.atomsbt.ru/lk_auth/pay.php?account=${account}&ls=${account}`;
}

function formatMoney(value) {
  const amount = Number(value) || 0;
  if (!amount) return "0 ₽";
  return `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function getCurrentMonthCharge(client) {
  const latest = (client.debtHistory || []).slice(-1)[0] || {};
  return latest.charge || client.amount || '0 ₽';
}

function getTotalDebt(client) {
  if (client.debt) return client.debt;
  const latestBalance = (client.debtHistory || []).reduce((max, item) => Math.max(max, parseMoney(item.balance || 0)), 0);
  return formatMoney(latestBalance);
}

function parseRuDate(value) {
  const match = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

function formatRuDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + Number(days || 0));
  return result;
}

function getLegalRestrictionDates(restriction = {}) {
  const notice = parseRuDate(restriction.noticeDate);
  const planned = parseRuDate(restriction.plannedDate);

  if (notice && planned) {
    const diff = Math.round((planned - notice) / 86400000);
    if (diff >= 20) {
      return { noticeDate: formatRuDate(notice), plannedDate: formatRuDate(planned) };
    }
    const normalizedNotice = addDays(planned, -20);
    return { noticeDate: formatRuDate(normalizedNotice), plannedDate: formatRuDate(planned) };
  }

  if (planned && !notice) {
    return { noticeDate: formatRuDate(addDays(planned, -20)), plannedDate: formatRuDate(planned) };
  }

  if (notice && !planned) {
    return { noticeDate: formatRuDate(notice), plannedDate: formatRuDate(addDays(notice, 20)) };
  }

  const base = new Date();
  return { noticeDate: formatRuDate(base), plannedDate: formatRuDate(addDays(base, 20)) };
}

function isHeroResourceService(name) {
  const normalized = String(name || "").toLowerCase();
  return !normalized.includes("пен") && !normalized.includes("долг");
}

function getHeroServiceLabel(name) {
  const normalized = String(name || '').toLowerCase();
  if (normalized.includes('электро')) return 'ЭС';
  if (normalized.includes('холод')) return 'ХВС';
  if (normalized.includes('горяч')) return 'ГВС';
  if (normalized.includes('отоп')) return 'Отопл';
  return name || 'Услуга';
}

function renderHeroSummary(client) {

  const stageTitles = {
    1: "Передача показаний",
    2: "Формирование и доставка квитанции",
    3: "Оплата",
    4: "Задолженность / пени"
  };

  const currentStage = Number(client.currentStage || 1);
  const hasDebt = parseMoney(client.debt) > 0;
  const hasPenalty = parseMoney(client.penalty) > 0;
  const latest = (client.debtHistory || []).slice(-1)[0] || {};
  const latestReadingText = `${latest.readingMethod || ''} ${latest.readingAcceptedFor || ''} ${latest.note || ''}`.toLowerCase();
  const hasLateReadingsForNextBill = /после срока|поздн|следующ/.test(latestReadingText);

  const heroStage = document.getElementById("heroStage");
  const heroAction = document.getElementById("heroAction");
  const heroReading = document.getElementById("heroReading");
  const heroPayment = document.getElementById("heroPayment");
  const heroPayButton = document.getElementById("heroPayButton");
  const penaltyCard = document.getElementById("penaltyCard");
  const firstScreenGrid = document.getElementById("firstScreenGrid");
  const debtLabel = document.getElementById("debtLabel");
  const debtCard = document.getElementById("debtCard");

  if (heroStage) {
    heroStage.textContent = stageTitles[currentStage] || "Проверка данных";
  }
  if (penaltyCard) {
    penaltyCard.style.display = hasPenalty ? "block" : "none";
  }

  if (firstScreenGrid) {
    firstScreenGrid.classList.toggle("no-penalty", !hasPenalty);
  }

  if (debtLabel) {
    debtLabel.textContent = currentStage < 4 ? "К оплате" : "Задолженность";
  }
  if (debtCard) {
    debtCard.setAttribute("aria-label", currentStage < 4 ? "Показать, что сейчас к оплате" : "Показать, как образовалась задолженность");
  }

  if (heroReading) {
    const readingDate = latest.readingDate && latest.readingDate !== "—" ? latest.readingDate : "не переданы";
    heroReading.textContent = latest.readingMethod && latest.readingMethod !== "показания не передавались"
      ? `${readingDate}, ${latest.readingMethod}`
      : "показания не переданы";
  }

  if (heroPayment) {
    if (latest.paymentDate && latest.paymentDate !== "—") {
      heroPayment.textContent = `${latest.paymentDate}, ${latest.paymentAmount || latest.paid || ""}`;
    } else {
      heroPayment.textContent = "оплата не поступила";
    }
  }

  if (heroAction) {
    heroAction.classList.remove('hero-action-link');
    heroAction.removeAttribute('role');
    heroAction.removeAttribute('tabindex');
    heroAction.removeAttribute('aria-label');

    const hasActiveRestriction = !!(client.restriction && client.restriction.active);
    const restrictionService = hasActiveRestriction
      ? (client.restriction.serviceLabel || client.restriction.service || "услуга")
      : "";
    let mainText = "";
    let mainClass = "hero-action-main hero-action-main--ok";
    let mainAttrs = "";

    if (hasDebt || hasPenalty) {
      mainText = `Есть задолженность ${client.debt}${hasPenalty ? ` и пени ${client.penalty}` : ""}. Посмотрите, как она образовалась.`;
      mainClass = "hero-action-main hero-action-main--debt";
      mainAttrs = 'id="heroActionMainLink" role="button" tabindex="0" data-open-section="debtStack"';
    } else if (latest.readingMethod === "показания не передавались") {
      mainText = "Показания не переданы. Проверьте начисление и передайте фактические данные.";
      mainClass = "hero-action-main hero-action-main--ok";
    } else if (hasLateReadingsForNextBill) {
      mainText = "Показания переданы после срока. Текущий ЕПД рассчитан по среднему, а показания войдут в следующую квитанцию.";
      mainClass = "hero-action-main hero-action-main--ok hero-action-main--reading-link";
      mainAttrs = 'id="heroActionMainLink" role="button" tabindex="0" data-open-section="readingStack"';
    } else {
      mainText = "Задолженности нет. Всё в порядке.";
      mainClass = "hero-action-main hero-action-main--ok";
    }

    heroAction.innerHTML = `
      <span ${mainAttrs} class="${mainClass}">${mainText}</span>
      ${hasActiveRestriction ? `<span id="restrictionRiskLink" class="restriction-risk-link" role="button" tabindex="0">Риск ограничения: ${restrictionService}. Открыть блок «Ограничение услуги»</span>` : ""}
    `;
  }

  if (heroPayButton) {
    heroPayButton.href = paymentUrlFor(client);
  }
}

function getHistoryItems(client, year) {
  if (year === CURRENT_HISTORY_YEAR) {
    return client.debtHistory || [];
  }

  return (client.previousYears && client.previousYears[year]) || [];
}

const RU_MONTH_INDEX = {
  январ: 0,
  феврал: 1,
  март: 2,
  апрел: 3,
  мая: 4,
  май: 4,
  июн: 5,
  июл: 6,
  август: 7,
  сентябр: 8,
  октябр: 9,
  ноябр: 10,
  декабр: 11
};

function getMonthIndexFromText(value) {
  const normalized = String(value || '').toLowerCase().replace(/ё/g, 'е');
  const entry = Object.entries(RU_MONTH_INDEX).find(([key]) => normalized.includes(key));
  return entry ? entry[1] : null;
}

function getItemMonthKey(monthLabel) {
  const monthIndex = getMonthIndexFromText(monthLabel);
  const yearMatch = String(monthLabel || '').match(/(20\d{2})/);
  if (monthIndex === null || !yearMatch) return '';
  return `${yearMatch[1]}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function getEventMonthKey(event, fallbackYear = CURRENT_HISTORY_YEAR) {
  const raw = String(event?.date || '').toLowerCase().replace(/ё/g, 'е');
  const monthIndex = getMonthIndexFromText(raw);
  if (monthIndex === null) return '';
  const yearMatch = raw.match(/(20\d{2})/);
  const year = yearMatch ? yearMatch[1] : String(fallbackYear || CURRENT_HISTORY_YEAR);
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function getEventsForHistoryMonth(client, monthLabel, year = CURRENT_HISTORY_YEAR) {
  const monthKey = getItemMonthKey(monthLabel);
  if (!monthKey) return [];
  return (client.events || []).filter(event => getEventMonthKey(event, year) === monthKey);
}

function isReadingIssueItem(client, item, year = CURRENT_HISTORY_YEAR) {
  const itemText = [
    item.month,
    item.status,
    item.note,
    item.readingMethod,
    item.readingWhat,
    item.readingAcceptedFor,
    item.readingValues,
    item.class
  ].join(' ').toLowerCase().replace(/ё/g, 'е');

  const eventText = getEventsForHistoryMonth(client, item.month, year)
    .map(event => [event.title, event.description, event.status, event.class, ...(event.meta || []).map(meta => `${meta.label} ${meta.value}`)].join(' '))
    .join(' ')
    .toLowerCase()
    .replace(/ё/g, 'е');

  const combined = `${itemText} ${eventText}`;

  return /не передав|не переданы|показания не перед/.test(combined)
    || /поздн|с опозданием|нарушени[ея] срока|после срока|передано с нарушением/.test(combined)
    || ((/по среднему|по нормативу|перерасчет|перерасч[её]т/.test(combined)) && /(показан|перед)/.test(combined));
}

function isPaymentIssueItem(item) {
  const charge = parseMoney(item.charge || 0);
  const paid = parseMoney(item.paymentAmount || item.paid || 0);
  const balance = parseMoney(item.balance || 0);
  const combined = [item.status, item.note, item.paymentMethod, item.paymentAppliedFor, item.class]
    .join(' ')
    .toLowerCase()
    .replace(/ё/g, 'е');

  return paid <= 0
    || paid + 0.01 < charge
    || balance > 0
    || /не оплач|не поступила|частич|остаток|задолж/.test(combined);
}

function getProblemReadingHistoryItems(client, year = CURRENT_HISTORY_YEAR) {
  const items = getHistoryItems(client, year);
  if (year !== CURRENT_HISTORY_YEAR) return items;
  const firstProblemIndex = items.findIndex(item => isReadingIssueItem(client, item, year));
  return firstProblemIndex >= 0 ? items.slice(firstProblemIndex) : items.slice(-1);
}

function getProblemPaymentHistoryItems(client, year = CURRENT_HISTORY_YEAR) {
  const items = getHistoryItems(client, year);
  if (year !== CURRENT_HISTORY_YEAR) return items;
  const filtered = items.filter(item => isPaymentIssueItem(item));
  return filtered.length ? filtered : items.slice(-1);
}

function syncHistorySectionForOpen(sectionId, targetId = '') {
  if (!activeClient) return;

  if (sectionId === 'readingStack') {
    renderReadingHistory(activeClient, CURRENT_HISTORY_YEAR, !targetId, {
      visibleItems: getProblemReadingHistoryItems(activeClient, CURRENT_HISTORY_YEAR),
      openLatest: false,
      openAllRendered: false
    });
  }

  if (sectionId === 'paymentStack') {
    renderPaymentHistory(activeClient, CURRENT_HISTORY_YEAR, !targetId, {
      visibleItems: getProblemPaymentHistoryItems(activeClient, CURRENT_HISTORY_YEAR),
      openLatest: false,
      openAllRendered: false
    });
  }
}

function renderHistoryYearLinks(containerId, type, client, activeYear, highlightActive = true) {

  const root = document.getElementById(containerId);
  if (!root) return;

  const years = [CURRENT_HISTORY_YEAR, ...Object.keys(client.previousYears || {}).sort((a, b) => Number(b) - Number(a))];

  root.innerHTML = years.map(year => `
    <button class="${highlightActive && year === activeYear ? "active" : ""}" type="button" data-year="${year}" data-type="${type}">
      ${year}
    </button>
  `).join("");

  root.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      const year = button.dataset.year;
      if (button.dataset.type === "reading") {
        renderReadingHistory(client, year, true, { openLatest: true });
      } else {
        renderPaymentHistory(client, year, true, { openLatest: true });
      }
    });
  });
}

function getHistoryResourceServices(client) {
  return (client.services || [])
    .filter(service => isHeroResourceService(service.name))
    .map(service => ({ ...service, key: getServiceKey(service.name) }));
}

function serviceRequiresReading(service) {
  const normalizedName = String(service.name || '').toLowerCase();
  const normalizedMethod = String(service.method || '').toLowerCase();

  if (normalizedName.includes('отоп') || normalizedMethod.includes('норматив') || normalizedMethod.includes('не начисляется')) {
    return false;
  }

  return /показан|среднему|перерасч|без измен/.test(normalizedMethod) || /(элект|вод)/.test(normalizedName);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractReadingSegmentForService(item, service) {
  const raw = String(item.readingValues || '').trim();
  const key = getServiceKey(service.name);

  const matchers = {
    'electricity': /элект|эл\.?\s*снаб|эл\.?эн/i,
    'cold-water': /хвс|холод/i,
    'hot-water': /гвс|горяч/i,
    'heating': /отоп/i
  };

  if (raw) {
    const parts = raw.split(';').map(part => part.trim()).filter(Boolean);
    const matcher = matchers[key] || new RegExp(escapeRegExp(service.name || ''), 'i');
    const found = parts.find(part => matcher.test(part));
    if (found) return found;
  }

  const method = String(service.method || '');
  if (method.includes(':')) {
    return method.split(':').slice(1).join(':').trim();
  }

  if (!serviceRequiresReading(service)) {
    return 'Для услуги показания не требуются';
  }

  return method || '—';
}

function allocateAmountForService(itemValue, services, currentService, useCurrentPaid = false) {
  const total = parseMoney(itemValue);
  if (!total) return '0 ₽';

  if (useCurrentPaid) {
    return formatMoney(parseMoney(currentService.paid || 0));
  }

  const weighted = services.filter(service => parseMoney(service.charge || service.amount || 0) > 0);
  const totalWeight = weighted.reduce((sum, service) => sum + parseMoney(service.charge || service.amount || 0), 0) || 1;
  const currentWeight = parseMoney(currentService.charge || currentService.amount || 0);
  if (!currentWeight) return '0 ₽';
  return formatMoney(total * (currentWeight / totalWeight));
}

function renderReadingHistory(client, year = CURRENT_HISTORY_YEAR, showAll = true, options = {}) {
  const root = document.getElementById("readingHistory");
  if (!root) return;

  const { openLatest = false, visibleItems = null, openAllRendered = false } = options;
  renderHistoryYearLinks("readingYearLinks", "reading", client, year, showAll);

  const allItems = Array.isArray(visibleItems) ? visibleItems : getHistoryItems(client, year);
  const items = showAll ? allItems : allItems.slice(-1);
  const services = getHistoryResourceServices(client);

  if (!items.length) {
    root.innerHTML = '<div class="history-empty">История передачи показаний за выбранный год отсутствует.</div>';
    return;
  }

  const latestVisibleIndex = items.length - 1;
  const hasMultipleItems = items.length > 1;

  root.innerHTML = items.map((item, itemIndex) => {
    const isLatestVisible = itemIndex === latestVisibleIndex;
    const serviceBlocks = services.map(service => {
      const serviceKey = service.key;
      const needsReading = serviceRequiresReading(service);
      const lateReadingText = `${item.readingMethod || ''} ${item.readingAcceptedFor || ''} ${item.note || ''}`.toLowerCase();
      const lateReading = needsReading && /после срока|поздн|следующ/.test(lateReadingText);
      const readingMissing = needsReading && !lateReading && (String(item.readingMethod || '').toLowerCase() === 'показания не передавались' || String(service.method || '').toLowerCase().includes('по среднему'));
      const badgeClass = !needsReading ? 'info' : (readingMissing || lateReading) ? 'warning' : 'ok';
      const badgeLabel = !needsReading ? 'Без показаний' : lateReading ? 'Поздно' : readingMissing ? 'Не переданы' : 'Переданы';
      const readingValues = extractReadingSegmentForService(item, service);
      const acceptedFor = item.readingAcceptedFor || item.month;
      const readingDate = !needsReading ? '—' : (readingMissing ? '—' : (item.readingDate || '—'));
      const readingMethod = !needsReading
        ? 'Для услуги показания не требуются'
        : lateReading
          ? `${item.readingMethod || 'переданы после срока'}. Будут учтены в следующей квитанции`
          : (readingMissing ? 'показания не передавались' : (item.readingMethod || '—'));
      const stableId = year === CURRENT_HISTORY_YEAR && isLatestVisible ? `reading-current-${serviceKey}` : `reading-${year}-${itemIndex + 1}-${serviceKey}`;

      return `
        <article id="${stableId}" class="history-service-card history-service-card--reading" data-service-key="${serviceKey}">
          <div class="history-service-head compact-head">
            <div class="history-service-name-wrap">
              <img class="history-service-icon" src="${getServiceImage(service.name)}" alt="${service.name}">
              <div>
                <div class="history-service-name">${service.name}</div>
                <div class="history-service-caption">${service.method || '—'}</div>
              </div>
            </div>
            <span class="history-summary-badge ${badgeClass}">${badgeLabel}</span>
          </div>
          <div class="history-metric-grid two-col">
            <div class="history-metric"><span>Когда переданы</span><b>${readingDate}</b></div>
            <div class="history-metric"><span>На какой месяц учтены</span><b>${acceptedFor}</b></div>
            <div class="history-metric full-width"><span>Каким способом</span><b>${readingMethod}</b></div>
            <div class="history-metric full-width emphasis"><span>Какие показания</span><b>${readingValues || '—'}</b></div>
          </div>
        </article>
      `;
    }).join('');

    const monthLateReading = /после срока|поздн|следующ/.test(`${item.readingMethod || ''} ${item.readingAcceptedFor || ''} ${item.note || ''}`.toLowerCase());
    const monthBadgeLabel = item.readingMethod === "показания не передавались" ? "Не переданы" : monthLateReading ? "Учтутся позже" : "Показания";
    const monthCaption = monthLateReading
      ? `Переданы ${item.readingDate || '—'}, будут учтены в следующей квитанции`
      : item.readingDate && item.readingDate !== '—'
        ? `Переданы ${item.readingDate}`
        : 'Показания за месяц';

    return `
      <details class="history-item history-item--reading" ${(openAllRendered || (openLatest && (hasMultipleItems ? isLatestVisible : true))) ? 'open' : ''}>
        <summary>
          <div class="history-summary-main">
            <div>
              <div class="history-summary-title">${item.month}</div>
              <div class="history-summary-meta">${monthCaption}</div>
            </div>
            <div class="history-summary-right">
              <span class="history-summary-badge ${item.class || "info"}">${monthBadgeLabel}</span>
              <span class="history-summary-chevron" aria-hidden="true"></span>
            </div>
          </div>
        </summary>
        <div class="history-content">
          <div class="history-service-list">${serviceBlocks}</div>
        </div>
      </details>
    `;
  }).join("");
}

function renderPaymentHistory(client, year = CURRENT_HISTORY_YEAR, showAll = true, options = {}) {
  const root = document.getElementById("paymentHistory");
  if (!root) return;

  const { openLatest = false, visibleItems = null, openAllRendered = false } = options;
  renderHistoryYearLinks("paymentYearLinks", "payment", client, year, showAll);

  const allItems = Array.isArray(visibleItems) ? visibleItems : getHistoryItems(client, year);
  const items = showAll ? allItems : allItems.slice(-1);
  const services = getHistoryResourceServices(client);

  if (!items.length) {
    root.innerHTML = '<div class="history-empty">История оплаты за выбранный год отсутствует.</div>';
    return;
  }

  const latestVisibleIndex = items.length - 1;
  const hasMultipleItems = items.length > 1;

  root.innerHTML = items.map((item, itemIndex) => {
    const isLatestVisible = itemIndex === latestVisibleIndex;
    const isCurrentMonth = year === CURRENT_HISTORY_YEAR && isLatestVisible;
    const serviceBlocks = services.map(service => {
      const serviceKey = service.key;
      const paidAmount = allocateAmountForService(item.paymentAmount || item.paid || 0, services, service, isCurrentMonth);
      const chargeAmount = isCurrentMonth
        ? formatMoney(parseMoney(service.charge || service.amount || 0))
        : allocateAmountForService(item.charge || 0, services, service, false);
      const paidNumber = parseMoney(paidAmount);
      const chargeNumber = parseMoney(chargeAmount);
      const balanceAmount = formatMoney(Math.max(0, Math.round((chargeNumber - paidNumber) * 100) / 100));
      const badgeClass = paidNumber <= 0 ? 'danger' : paidNumber + 0.01 < chargeNumber ? 'warning' : 'ok';
      const badgeLabel = paidNumber <= 0 ? 'Не оплачено' : paidNumber + 0.01 < chargeNumber ? 'Частично' : 'Оплачено';
      const paymentDate = paidNumber <= 0 ? '—' : (item.paymentDate || '—');
      const paymentMethod = paidNumber <= 0 ? 'оплата не поступила' : (item.paymentMethod || '—');
      const stableId = year === CURRENT_HISTORY_YEAR && isLatestVisible ? `payment-current-${serviceKey}` : `payment-${year}-${itemIndex + 1}-${serviceKey}`;

      return `
        <article id="${stableId}" class="history-service-card history-service-card--payment" data-service-key="${serviceKey}">
          <div class="history-service-head compact-head">
            <div class="history-service-name-wrap">
              <img class="history-service-icon" src="${getServiceImage(service.name)}" alt="${service.name}">
              <div>
                <div class="history-service-name">${service.name}</div>
                <div class="history-service-caption">Оплата и зачисление по услуге</div>
              </div>
            </div>
            <span class="history-summary-badge ${badgeClass}">${badgeLabel}</span>
          </div>
          <div class="history-metric-grid two-col">
            <div class="history-metric"><span>Начислено</span><b>${chargeAmount}</b></div>
            <div class="history-metric"><span>Оплачено</span><b>${paidAmount}</b></div>
            <div class="history-metric"><span>Осталось</span><b>${balanceAmount}</b></div>
            <div class="history-metric"><span>За какой месяц учтена</span><b>${item.paymentAppliedFor || item.month}</b></div>
            <div class="history-metric"><span>Когда оплачено</span><b>${paymentDate}</b></div>
            <div class="history-metric"><span>Каким способом</span><b>${paymentMethod}</b></div>
          </div>
        </article>
      `;
    }).join('');

    const monthBadgeLabel = item.paymentDate === "—" ? "Не оплачено" : "Оплата";
    const monthCaption = item.paymentDate && item.paymentDate !== '—'
      ? `Оплата поступила ${item.paymentDate}`
      : 'Оплата за месяц';

    return `
      <details class="history-item history-item--payment" ${(openAllRendered || (openLatest && (hasMultipleItems ? isLatestVisible : true))) ? 'open' : ''}>
        <summary>
          <div class="history-summary-main">
            <div>
              <div class="history-summary-title">${item.month}</div>
              <div class="history-summary-meta">${monthCaption}</div>
            </div>
            <div class="history-summary-right">
              <span class="history-summary-badge ${item.class || "info"}">${monthBadgeLabel}</span>
              <span class="history-summary-chevron" aria-hidden="true"></span>
            </div>
          </div>
        </summary>
        <div class="history-content">
          <div class="history-service-list">${serviceBlocks}</div>
        </div>
      </details>
    `;
  }).join("");
}

function allocateMoneyParts(totalValue, services) {
  const total = parseMoney(totalValue);
  if (!services.length || total <= 0) {
    return services.map(() => 0);
  }

  const weights = services.map(service => Math.max(parseMoney(service.charge || service.amount || service.weight || 0), 0));
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const normalizedWeights = weightSum > 0
    ? weights.map(value => value / weightSum)
    : services.map(() => 1 / services.length);

  let allocated = 0;
  return services.map((service, index) => {
    if (index === services.length - 1) {
      const remainder = Math.max(0, Math.round((total - allocated) * 100) / 100);
      return remainder;
    }
    const value = Math.round(total * normalizedWeights[index] * 100) / 100;
    allocated += value;
    return value;
  });
}

function extractVolumeOnly(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '—') return '—';

  const beforeEquals = raw.split('=')[0].trim();
  const beforeMultiply = beforeEquals.split('×')[0].trim();
  return beforeMultiply || beforeEquals || raw;
}

function buildDebtDetailServices(client, item) {
  const allServices = (client.services || []).filter(service => isHeroResourceService(service.name));
  let baseServices = allServices.filter(service => parseMoney(service.charge || service.amount || 0) > 0);

  if (!baseServices.length) {
    baseServices = allServices.length ? allServices : (client.services || []).filter(service => !String(service.name || '').toLowerCase().includes('пен'));
  }

  if (!baseServices.length) return [];

  const chargeParts = allocateMoneyParts(item.charge || 0, baseServices);
  const paidParts = allocateMoneyParts(item.paid || 0, baseServices);
  const balanceTotal = parseMoney(item.balance || 0);

  return baseServices.map((service, index) => {
    const charge = chargeParts[index] || 0;
    const paid = paidParts[index] || 0;
    let balance = Math.max(0, Math.round((charge - paid) * 100) / 100);
    if (index === baseServices.length - 1) {
      const previous = baseServices.slice(0, -1).reduce((sum, _, idx) => sum + Math.max(0, Math.round(((chargeParts[idx] || 0) - (paidParts[idx] || 0)) * 100) / 100), 0);
      balance = Math.max(0, Math.round((balanceTotal - previous) * 100) / 100);
    }

    return {
      key: getServiceKey(service.name),
      name: service.name,
      method: service.method || service.note || '—',
      charge: formatMoney(charge),
      paid: formatMoney(paid),
      balance: formatMoney(balance),
      reading: extractReadingSegmentForService(item, service) || '—',
      volume: extractVolumeOnly(service.volume || service.note || '—')
    };
  });
}

function renderDebtHistory(client) {
  const root = document.getElementById("debtHistory");
  const title = document.getElementById("debtSectionTitle");
  if (!root) return;

  const allItems = client.debtHistory || [];
  const hasDebt = parseMoney(getTotalDebt(client)) > 0 || allItems.some(item => parseMoney(item.balance) > 0);

  const firstDebtIndex = allItems.findIndex(item => parseMoney(item.balance) > 0);
  const items = hasDebt
    ? allItems.slice(firstDebtIndex >= 0 ? firstDebtIndex : 0)
    : allItems.slice(-1);

  if (title) {
    title.innerText = hasDebt ? "Как образовалась задолженность" : "Задолженности нет";
  }

  if (!items.length) {
    root.innerHTML = '<div class="debt-empty">Задолженности по прошлым месяцам нет.</div>';
    return;
  }

  root.innerHTML = items.map((item, itemIndex) => {
    const services = buildDebtDetailServices(client, item);
    const servicesHtml = services.map(service => `
      <article class="debt-service-card epd-service-card" data-service-key="${service.key}">
        <div class="debt-service-headline">
          <div class="debt-service-ident">
            <img class="history-service-icon" src="${getServiceImage(service.name)}" alt="${service.name}">
            <div>
              <div class="debt-service-name">${service.name}</div>
              <div class="debt-service-note">${service.method}</div>
            </div>
          </div>
          <div class="debt-service-reading"><span>Объём</span><b>${service.volume}</b></div>
        </div>
        <div class="debt-service-grid epd-grid">
          <div class="debt-service-cell primary-cell">
            <span>Начислено</span>
            <strong>${service.charge}</strong>
          </div>
          <div class="debt-service-cell primary-cell">
            <span>Оплачено</span>
            <strong>${service.paid}</strong>
          </div>
          <div class="debt-service-cell primary-cell remain-cell">
            <span>Осталось</span>
            <strong>${service.balance}</strong>
          </div>
        </div>
        <div class="debt-service-epd-lines">
          <div class="debt-epd-line"><span>Начисление</span><b>${service.method}</b></div>
          <div class="debt-epd-line"><span>Объём</span><b>${service.volume}</b></div>
        </div>
      </article>
    `).join('');

    return `
      <details class="debt-item" ${items.length === 1 ? 'open' : ''}>
        <summary>
          <div class="debt-summary-top">
            <div>
              <div class="debt-month">${item.month}</div>
              <div class="debt-toggle-hint">Нажмите, чтобы посмотреть подробный расчёт по услугам</div>
            </div>
            <div class="debt-summary-right">
              <div class="debt-status ${item.class || "info"}">${item.status}</div>
              <span class="debt-summary-chevron" aria-hidden="true"></span>
            </div>
          </div>

          <div class="debt-grid compact">
            <div class="debt-cell">
              <span>Начислено</span>
              <strong>${item.charge}</strong>
            </div>
            <div class="debt-cell">
              <span>Оплачено</span>
              <strong>${item.paid}</strong>
            </div>
            <div class="debt-cell emphasis-cell">
              <span>Осталось</span>
              <strong>${item.balance}</strong>
            </div>
          </div>
        </summary>

        <div class="debt-content">
          <div class="debt-meta debt-meta-panel">
            <div class="debt-meta-chip"><span>Показания</span><b>${item.readingDate || '—'}</b><small>${item.readingMethod || '—'}</small></div>
            <div class="debt-meta-chip"><span>Оплата</span><b>${item.paymentDate || '—'}</b><small>${item.paymentMethod || '—'}</small></div>
            <div class="debt-meta-chip wide"><span>Комментарий</span><b>${item.note || '—'}</b></div>
          </div>
          <div class="debt-service-list">${servicesHtml}</div>
        </div>
      </details>
    `;
  }).join("");
}

function renderMonthMap(client) {
  const hint = document.getElementById("currentStageHint");
  const steps = Array.from(document.querySelectorAll(".month-step"));
  const debtStep = document.querySelector('.month-step-4');
  const dangerConnector = document.querySelector('.month-connector.danger');

  if (!steps.length) return;

  const titles = {
    1: "Передача показаний",
    2: "Формирование и доставка квитанции",
    3: "Оплата",
    4: "Долг / пени"
  };

  const currentStage = Number(client.currentStage || 1);
  const hasDebtPenalty = parseMoney(client.debt) > 0 || parseMoney(client.penalty) > 0;
  if (debtStep) debtStep.style.display = hasDebtPenalty ? '' : 'none';
  if (dangerConnector) dangerConnector.style.display = hasDebtPenalty ? '' : 'none';

  steps.forEach(step => {
    step.classList.remove("done", "current", "future");
    const oldBadge = step.querySelector(".month-badge");
    if (oldBadge) oldBadge.remove();

    const stage = Number(step.dataset.stage);
    if (stage < currentStage) {
      step.classList.add("done");
    } else if (stage === currentStage) {
      step.classList.add("current");
      step.insertAdjacentHTML("beforeend", '<div class="month-badge">Вы сейчас здесь</div>');
    } else {
      step.classList.add("future");
    }
  });

  if (hint) {
    const note = client.currentStageNote ? ` ${client.currentStageNote}` : "";
    hint.innerHTML = `Сейчас Вы находитесь на этапе: <b>${titles[currentStage] || "Проверка данных"}</b>.${note}`;
  }
}


function getServiceImage(name) {
  const normalized = String(name || "").toLowerCase();

  if (normalized.includes("электроснабж") || normalized.includes("электро")) return "images/services/electricity.png";
  if (normalized.includes("холод") && normalized.includes("вод")) return "images/services/cold-water.png";
  if (normalized.includes("горяч") && normalized.includes("вод")) return "images/services/hot-water.png";
  if (normalized.includes("отоп")) return "images/services/heating.png";
  if (normalized.includes("пен")) return "images/services/penalty.png";
  if (normalized.includes("долг")) return "images/services/penalty.png";

  return "images/services/default.png";
}


function getServiceKey(name) {
  const normalized = String(name || "").toLowerCase();
  if (normalized.includes("пен")) return "penalty";
  if (normalized.includes("электроснабж") || normalized.includes("электро")) return "electricity";
  if (normalized.includes("холод") && normalized.includes("вод")) return "cold-water";
  if (normalized.includes("горяч") && normalized.includes("вод")) return "hot-water";
  if (normalized.includes("отоп")) return "heating";
  if (normalized.includes("долг")) return "debt";
  return normalized.replace(/[^а-яa-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "service";
}

function renderHeroServices(services) {
  const root = document.getElementById("heroServices");
  if (!root) return;

  if (!services.length) {
    root.innerHTML = '<div class="hero-service-empty">Нет данных по услугам</div>';
    return;
  }

  const resourceServices = services
    .filter(service => isHeroResourceService(service.name))
    .map(service => ({ ...service }));

  if (!resourceServices.length) {
    root.innerHTML = '<div class="hero-service-empty">Нет данных по услугам</div>';
    return;
  }

  const hiddenDebtServices = services.filter(service => !isHeroResourceService(service.name));
  const extraDebtStart = hiddenDebtServices.reduce((sum, service) => sum + parseMoney(service.debtStart || 0), 0);
  const extraDebtEnd = hiddenDebtServices.reduce((sum, service) => sum + parseMoney(service.debtEnd || 0), 0);

  if (resourceServices[0] && (extraDebtStart || extraDebtEnd)) {
    resourceServices[0].debtStart = formatMoney(parseMoney(resourceServices[0].debtStart || 0) + extraDebtStart);
    resourceServices[0].debtEnd = formatMoney(parseMoney(resourceServices[0].debtEnd || 0) + extraDebtEnd);
  }

  root.innerHTML = resourceServices.map((service, index) => {
    const subtitle = service.method || service.note || "";
    const debtEndClass = parseMoney(service.debtEnd) > 0 ? "warning-value" : "";
    const serviceKey = getServiceKey(service.name);
    const financeTiles = [
      { label: 'Долг на начало', value: service.debtStart || '0 ₽', section: 'debtStack', target: '' },
      { label: 'Начисление', value: service.charge || service.amount || '0 ₽', section: 'servicesStack', target: `service-${serviceKey}` },
      { label: 'Оплата', value: service.paid || '0 ₽', section: 'paymentStack', target: '' },
      { label: 'Долг на конец', value: service.debtEnd || '0 ₽', section: 'timelineStack', target: 'timeline-payment' }
    ];

    return `
      <div class="hero-service-item">
        <div class="hero-service-main" role="button" tabindex="0" data-open-section="readingStack" data-open-target="reading-current-${serviceKey}">
          <img class="hero-service-icon" src="${getServiceImage(service.name)}" alt="${service.name}">
          <div class="hero-service-text">
            <div class="hero-service-name" title="${service.name}">${service.name}</div>
            ${subtitle ? `<div class="hero-service-subtitle">${subtitle}</div>` : ""}
          </div>
        </div>

        <div class="hero-service-finance">
          ${financeTiles.map(tile => `
            <div class="hero-finance-link" role="button" tabindex="0" data-open-section="${tile.section}" data-open-target="${tile.target}">
              <span>${tile.label}</span>
              <b class="${tile.label === 'Долг на конец' ? debtEndClass : ''}">${tile.value}</b>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join("");

  root.querySelectorAll('[data-open-section]').forEach(tile => {
    if (tile.dataset.bound === 'true') return;
    tile.dataset.bound = 'true';

    const handler = () => openStackSection(tile.dataset.openSection, tile.dataset.openTarget || '');
    tile.addEventListener('click', handler);
    tile.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handler();
      }
    });
  });
}

function renderServices(services) {
  const root = document.getElementById("servicesBreakdown");
  if (!root) return;

  if (!services.length) {
    root.innerHTML = '<div class="service-card"><div class="service-name">Нет данных по услугам</div></div>';
    return;
  }

  root.innerHTML = services.map(service => {
    const serviceKey = getServiceKey(service.name);
    const calculationHtml =
      Array.isArray(service.calculation) && service.calculation.length
        ? `<div class="service-calculation">
            <strong>Расчёт:</strong>
            ${service.calculation.map(row => `<span>${row}</span>`).join("")}
          </div>`
        : "";

    return `
      <article id="service-${serviceKey}" class="service-card ${serviceKey === "penalty" ? "service-penalty-card" : ""}">
        <div class="service-top">
          <div class="service-name">${service.name}</div>
          <div class="service-amount">${service.amount}</div>
        </div>
        <div class="service-meta">
          <div><span>Начисление:</span> ${service.method}</div>
          <div><span>Объём и расчёт:</span> ${service.volume}</div>
          ${service.tariff && service.tariff !== "—" ? `<div><span>Тариф:</span> ${service.tariff}</div>` : ""}
          ${service.note ? `<div><span>Пояснение:</span> ${service.note}</div>` : ""}
        </div>
        ${calculationHtml}
        <img class="service-illustration" src="${getServiceImage(service.name)}" alt="${service.name}">
      </article>
    `;
  }).join("");
}

function renderTimeline(events, client) {
  let html = "";
  const paymentLikeIndexes = events
    .map((event, index) => {
      const text = `${event.title || ''} ${event.status || ''} ${event.description || ''} ${event.icon || ''}`.toLowerCase();
      return /оплат|долг|пени|огранич|warning|payment|restriction|задолж/.test(text) ? index : -1;
    })
    .filter(index => index >= 0);
  const paymentAnchorIndex = paymentLikeIndexes.length ? paymentLikeIndexes[paymentLikeIndexes.length - 1] : Math.max(events.length - 1, 0);

  events.forEach((event, index) => {
    const metaHtml =
      Array.isArray(event.meta) && event.meta.length
        ? `<div class="event-meta">${event.meta
            .map(item => `
              <div class="meta-line">
                <span class="meta-label">${item.label}:</span>
                <span class="${item.class || ""}">${item.value}</span>
              </div>
            `)
            .join("")}</div>`
        : "";

    const calcHtml =
      Array.isArray(event.calculation) && event.calculation.length
        ? `<div class="calc-box ${event.calcClass || ""}">
            <div class="calc-box-title">Расчёт начисления</div>
            ${event.calculation.map(row => `<div>${row}</div>`).join("")}
          </div>`
        : "";

    const defaultPaymentStatuses = ["Квитанция готова", "Требуется оплата", "Есть задолженность", "Доступна к оплате"];
    const fallbackPaymentUrl = defaultPaymentStatuses.includes(event.status)
      ? `https://lkfl.atomsbt.ru/lk_auth/pay.php?account=${encodeURIComponent(client.account)}&ls=${encodeURIComponent(client.account)}`
      : "";

    const statusUrl = event.statusUrl
      ? event.statusUrl.replaceAll("{account}", encodeURIComponent(client.account))
      : fallbackPaymentUrl;

    const statusHtml = statusUrl
      ? `<a class="status status-link ${event.class}" href="${statusUrl}" target="_blank" rel="noopener" title="Лицевой счёт будет передан в ссылке">${event.status}</a>`
      : `<span class="status ${event.class}">${event.status}</span>`;

    const anchorId = index === paymentAnchorIndex ? 'timeline-payment' : `timeline-event-${index + 1}`;

    html += `
      <article id="${anchorId}" class="event-card">
        <div class="event-illustration">
          <img src="images/icons/${event.icon}.png" alt="${event.title}">
        </div>

        <div class="event-body">
          <div class="event-date">${event.date}</div>
          <h3>${event.title}</h3>
          <p>${event.description}</p>
          ${metaHtml}
          ${calcHtml}
          ${statusHtml}
        </div>
      </article>
    `;
  });

  document.getElementById("timeline").innerHTML = html;
}

function renderRestriction(client) {
  const block = document.getElementById("restrictionBlock");
  const stack = document.getElementById("restrictionStack");

  if (!client.restriction || !client.restriction.active) {
    if (block) block.innerHTML = "";
    if (stack) stack.hidden = true;
    return;
  }

  if (stack) stack.hidden = false;

  const resource = client.restriction.serviceLabel || client.restriction.service || "услуга";
  const legalDates = getLegalRestrictionDates(client.restriction || {});

  block.innerHTML = `
    <section class="restriction">
      <div class="restriction-title">⚠ Планируемое ограничение</div>
      <p><b>Какая услуга:</b> ${resource}</p>
      <p><b>Причина:</b> ${client.restriction.reason}</p>
      <p><b>Дата уведомления:</b> ${legalDates.noticeDate}</p>
      <p><b>Планируемая дата ограничения:</b> ${legalDates.plannedDate}</p>
      <p><b>Что сделать:</b> оплатить задолженность или обратиться в центр обслуживания.</p>
      <p class="restriction-law-note">Сроки показаны по логике законодательства РФ: ограничение возможно не ранее чем через 20 дней после уведомления.</p>
    </section>
  `;
}


function measureExpandedSectionHeight(section) {
  const content = section.querySelector(".stacked-content");
  if (!content) return section.offsetHeight;

  const wasOpen = section.classList.contains("is-open");
  const wasLastCollapsed = section.classList.contains("last-visible-card");

  section.classList.add("is-measuring");
  section.classList.remove("last-visible-card");
  content.style.display = "block";
  content.style.visibility = "hidden";
  content.style.pointerEvents = "none";

  const height = section.offsetHeight;

  content.style.display = "";
  content.style.visibility = "";
  content.style.pointerEvents = "";
  section.classList.remove("is-measuring");
  section.classList.toggle("last-visible-card", wasLastCollapsed);
  section.classList.toggle("is-open", wasOpen);

  return height;
}

function getCollapsedVisibleHeight(section) {
  const header = section.querySelector(".stacked-header");
  if (!header) return 74;

  const styles = window.getComputedStyle(header);
  const topMargin = parseFloat(styles.marginTop) || 0;
  const whiteBottom = 10;

  return Math.ceil(topMargin + header.offsetHeight + whiteBottom);
}

function getSectionFullHeight(section) {
  return section.classList.contains("is-open")
    ? section.offsetHeight
    : measureExpandedSectionHeight(section);
}

function updateStackCardLayout() {
  const stack = document.querySelector(".section-stack");
  const sections = Array.from(document.querySelectorAll("[data-stack]"))
    .filter(section => !section.hidden);

  if (!stack || !sections.length) return;

  stack.style.height = "auto";
  stack.style.minHeight = "0";
  stack.style.paddingBottom = "0";
  stack.style.display = "flex";
  stack.style.flexDirection = "column";
  stack.style.gap = "6px";

  sections.forEach((section, index) => {
    section.classList.remove("last-visible-card");
    section.style.position = "relative";
    section.style.top = "auto";
    section.style.left = "auto";
    section.style.right = "auto";
    section.style.zIndex = section.classList.contains("is-open") ? "2" : "1";
    section.style.marginTop = "0";
    section.style.marginBottom = "0";
    section.style.transform = "none";
    section.style.flex = "0 0 auto";

    const header = section.querySelector('.stacked-header');
    const content = section.querySelector('.stacked-content');
    if (!header) return;

    const isOpen = section.classList.contains('is-open');
    if (isOpen) {
      section.style.height = 'auto';
      section.style.minHeight = '0';
      if (content) {
        content.style.display = 'block';
        content.style.height = 'auto';
        content.style.maxHeight = 'none';
        content.style.overflow = 'visible';
      }
    } else {
      const collapsedHeight = Math.ceil(header.getBoundingClientRect().height);
      section.style.height = `${collapsedHeight}px`;
      section.style.minHeight = `${collapsedHeight}px`;
      if (content) {
        content.style.display = 'none';
        content.style.height = '0px';
        content.style.maxHeight = '0px';
        content.style.overflow = 'hidden';
      }
    }
  });

  const page = document.querySelector(".page");
  if (page) {
    page.style.minHeight = "0px";
    page.style.paddingBottom = '8px';
  }
  document.body.style.minHeight = "0px";
  document.documentElement.style.minHeight = "0px";
}


function ensureNamedStackSections() {
  document.querySelectorAll('.section-stack > .stacked-section').forEach(section => {
    const title = (section.querySelector('.stack-title strong')?.textContent || '').trim();
    if (!section.id) {
      if (title === 'Что произошло по Вашей квитанции') section.id = 'timelineStack';
      else if (title === 'Действия и помощь') section.id = 'actionsStack';
      else if (title === 'Частые вопросы') section.id = 'faqStack';
    }
  });
}

function getClientScenarioFlags(client) {
  const debt = parseMoney(client.debt);
  const penalty = parseMoney(client.penalty);
  const hasRestriction = !!(client.restriction && client.restriction.active);
  const events = client.events || [];
  const services = client.services || [];
  const debtHistory = client.debtHistory || [];
  const latest = debtHistory.slice(-1)[0] || {};

  const textFrom = value => String(value || "").toLowerCase();
  const eventText = events.map(event => `${event.title || ""} ${event.description || ""} ${event.status || ""}`).join(" ").toLowerCase();
  const serviceText = services.map(service => `${service.name || ""} ${service.method || ""} ${service.note || ""} ${service.volume || ""} ${service.tariff || ""}`).join(" ").toLowerCase();
  const latestText = `${latest.status || ''} ${latest.note || ''} ${latest.readingMethod || ''} ${latest.paymentMethod || ''}`.toLowerCase();
  const allText = `${eventText} ${serviceText} ${latestText}`;

  const hasMissingReadings = /показания не переданы|не передал|показания не передавались/.test(allText);
  const hasLateReadings = /поздно|нарушением срока|после периода|перерасч[её]т/.test(allText);
  const hasReadingIssue = hasMissingReadings || hasLateReadings;

  const hasPaymentDate = !!(latest.paymentDate && latest.paymentDate !== '—');
  const hasPaymentAmount = parseMoney(latest.paymentAmount || latest.paid || 0) > 0;
  const hasPaymentMissing = /оплата не поступила|не оплачено|ожидается оплата|требуется оплата/.test(allText) || (!hasPaymentDate && Number(client.currentStage || 1) >= 3 && debt > 0);
  const hasLatePayment = /оплачено позже|после срока|с опозданием/.test(allText);
  const hasPartialPayment = /частичн|недоплат|старый долг остался/.test(allText) || services.some(service => {
    const name = textFrom(service.name);
    return !name.includes('пен') && parseMoney(service.paid) > 0 && parseMoney(service.debtEnd) > 0;
  });

  const hasDebt = debt > 0 || debtHistory.some(item => parseMoney(item.balance) > 0);
  const hasPenalty = penalty > 0 || services.some(service => textFrom(service.name).includes('пен') && parseMoney(service.amount || service.charge) > 0);
  const hasPenaltyService = services.some(service => textFrom(service.name).includes('пен'));
  const hasDebtService = services.some(service => textFrom(service.name).includes('долг'));
  const hasAverageCharge = services.some(service => /по среднему/.test(textFrom(service.method) + ' ' + textFrom(service.note)));
  const hasNonIdealCalculation = services.some(service => {
    const method = textFrom(service.method);
    return /по среднему|перерасч[её]т/.test(method);
  });

  const allChargesByMeter = services
    .filter(service => {
      const name = textFrom(service.name);
      return !name.includes('пен') && !name.includes('долг');
    })
    .every(service => {
      const method = textFrom(service.method);
      return /по показаниям|без начисления|не начисляется|по нормативу сезона|без изменения/.test(method) && !/по среднему/.test(method);
    });

  const allCurrentGood = !hasRestriction && !hasPenalty && !hasPaymentMissing && !hasReadingIssue && !hasDebt;

  return {
    debt,
    penalty,
    hasDebt,
    hasPenalty,
    hasRestriction,
    hasMissingReadings,
    hasLateReadings,
    hasReadingIssue,
    hasPaymentMissing,
    hasLatePayment,
    hasPartialPayment,
    hasPenaltyService,
    hasDebtService,
    hasAverageCharge,
    hasNonIdealCalculation,
    allChargesByMeter,
    allCurrentGood,
    currentStage: Number(client.currentStage || 1),
    hasCurrentPayment: hasPaymentDate && hasPaymentAmount
  };
}

function getStackSectionStatusMap(client) {
  const f = getClientScenarioFlags(client);

  const monthStatus =
    f.hasRestriction || f.hasPenalty || f.hasPaymentMissing
      ? 'bad'
      : (f.hasReadingIssue || f.hasPartialPayment || f.hasDebt ? 'warn' : 'good');

  const debtStatus =
    !f.hasDebt && !f.hasPenalty
      ? 'good'
      : (f.hasPenalty || f.hasRestriction ? 'bad' : 'warn');

  const readingStatus =
    f.hasReadingIssue
      ? 'warn'
      : 'good';

  const paymentStatus =
    f.hasPaymentMissing
      ? 'bad'
      : (f.hasLatePayment || f.hasPartialPayment ? 'warn' : 'good');

  const servicesStatus =
    f.hasPenaltyService
      ? 'bad'
      : (f.allChargesByMeter ? 'good' : (f.hasAverageCharge || f.hasNonIdealCalculation || f.hasDebtService ? 'warn' : 'good'));

  const timelineStatus =
    f.hasRestriction || f.hasPenalty || f.hasPaymentMissing
      ? 'bad'
      : (f.hasReadingIssue || f.hasPartialPayment || f.hasDebt ? 'warn' : 'good');

  return {
    monthStack: monthStatus,
    debtStack: debtStatus,
    readingStack: readingStatus,
    paymentStack: paymentStatus,
    restrictionStack: f.hasRestriction ? 'bad' : 'good',
    servicesStack: servicesStatus,
    timelineStack: timelineStatus,
    actionsStack: 'good',
    faqStack: 'good'
  };
}

function applyStackSectionStates(client) {
  ensureNamedStackSections();
  const statusMap = getStackSectionStatusMap(client);

  Object.entries(statusMap).forEach(([id, status]) => {
    const section = document.getElementById(id);
    if (!section) return;
    section.classList.remove('stack-status-good', 'stack-status-warn', 'stack-status-bad');
    section.classList.add(`stack-status-${status}`);
  });
}

function ensureStackHeaderControls() {
  document.querySelectorAll('.stacked-section .stack-number').forEach(circle => {
    if (circle.dataset.enhanced === 'true') return;
    const rawText = (circle.textContent || '').trim();
    circle.dataset.enhanced = 'true';
    circle.innerHTML = `
      <span class="stack-number-label">${rawText}</span>
      <span class="stack-home-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 10.8 12 4l8 6.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6.2 9.8V20h11.6V9.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 20v-5.2h4V20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>`;
  });
}

function closeAllStackSections(scrollToTop = false) {
  const sections = Array.from(document.querySelectorAll('[data-stack]'));
  sections.forEach(section => {
    section.classList.remove('is-open');
    const button = section.querySelector('.stacked-header');
    if (button) {
      button.setAttribute('aria-expanded', 'false');
    }
  });

  updateStackCardLayout();

  if (scrollToTop) {
    setTimeout(() => {
      const hero = document.querySelector('.hero-dashboard') || document.querySelector('.page');
      if (hero) {
        hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 80);
  }
}

function setupStackedSections() {
  ensureNamedStackSections();
  ensureStackHeaderControls();

  const sections = Array.from(document.querySelectorAll("[data-stack]"));

  sections.forEach(section => {
    section.classList.remove("is-open");
    const button = section.querySelector(".stacked-header");
    if (button) {
      button.setAttribute("aria-expanded", "false");
    }
  });

  sections.forEach(section => {
    const button = section.querySelector(".stacked-header");
    const content = section.querySelector(".stacked-content");
    const circle = section.querySelector('.stack-number');
    if (!button || !content || button.dataset.bound === "true") return;

    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      const wasOpen = section.classList.contains("is-open");

      if (!wasOpen && (section.id === 'readingStack' || section.id === 'paymentStack')) {
        syncHistorySectionForOpen(section.id, '');
      }

      sections.forEach(other => {
        const otherButton = other.querySelector(".stacked-header");
        const shouldOpen = !wasOpen && other === section;

        other.classList.toggle("is-open", shouldOpen);
        if (otherButton) {
          otherButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
        }
      });

      updateStackCardLayout();

      if (!wasOpen) {
        setTimeout(() => {
          updateStackCardLayout();
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 90);
      } else {
        setTimeout(() => {
          updateStackCardLayout();
          const stack = document.querySelector(".section-stack");
          if (stack) {
            stack.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 90);
      }
    });

    if (circle && circle.dataset.homeBound !== 'true') {
      circle.dataset.homeBound = 'true';
      circle.addEventListener('click', event => {
        if (!section.classList.contains('is-open')) return;
        event.preventDefault();
        event.stopPropagation();
        closeAllStackSections(true);
      });
    }
  });

  document.addEventListener("toggle", () => {
    setTimeout(updateStackCardLayout, 40);
  }, true);

  updateStackCardLayout();
  window.addEventListener("resize", updateStackCardLayout, { passive: true });
  window.addEventListener("load", () => setTimeout(updateStackCardLayout, 120));
  setTimeout(updateStackCardLayout, 350);
}

function openStackSection(sectionId, targetId = "") {
  const section = document.getElementById(sectionId);
  if (!section) return;

  syncHistorySectionForOpen(sectionId, targetId);

  const sections = Array.from(document.querySelectorAll("[data-stack]"));
  sections.forEach(other => {
    const otherButton = other.querySelector(".stacked-header");
    const shouldOpen = other === section;

    other.classList.toggle("is-open", shouldOpen);
    if (otherButton) {
      otherButton.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    }
  });

  updateStackCardLayout();

  setTimeout(() => {
    updateStackCardLayout();

    const target = targetId ? document.getElementById(targetId) : null;

    document.querySelectorAll(".service-card.target-highlight, .history-service-card.target-highlight").forEach(card => {
      card.classList.remove("target-highlight");
    });

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("target-highlight");
    } else {
      const firstDetails = section.querySelector('.history-item[open]');
      if (firstDetails) {
        firstDetails.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, 120);
}

function makeClickable(elementId, handler) {
  const element = document.getElementById(elementId);
  if (!element || element.dataset.clickBound === "true") return;

  element.dataset.clickBound = "true";
  element.addEventListener("click", handler);
  element.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler(event);
    }
  });
}

function setupHeroNavigation(client) {
  const heroActionMainLink = document.getElementById("heroActionMainLink");
  if (heroActionMainLink && heroActionMainLink.dataset.clickBound !== "true") {
    heroActionMainLink.dataset.clickBound = "true";
    const openMain = event => {
      event.preventDefault();
      const section = heroActionMainLink.dataset.openSection;
      const target = heroActionMainLink.dataset.openTarget || '';
      if (section) openStackSection(section, target);
    };
    heroActionMainLink.addEventListener("click", openMain);
    heroActionMainLink.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        openMain(event);
      }
    });
  }

  const restrictionRiskLink = document.getElementById("restrictionRiskLink");
  if (restrictionRiskLink && restrictionRiskLink.dataset.clickBound !== "true") {
    restrictionRiskLink.dataset.clickBound = "true";
    const openRestriction = event => {
      event.preventDefault();
      event.stopPropagation();
      openStackSection("restrictionStack");
    };
    restrictionRiskLink.addEventListener("click", openRestriction);
    restrictionRiskLink.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        openRestriction(event);
      }
    });
  }

  makeClickable("amountCard", () => {
    openStackSection("servicesStack");
  });

  makeClickable("debtCard", () => {
    openStackSection("debtStack");
  });

  makeClickable("penaltyCard", () => {
    openStackSection("servicesStack", "service-penalty");
  });

  makeClickable("heroStageTile", () => {
    openStackSection("monthStack");
  });

  makeClickable("heroReadingTile", () => {
    openStackSection("readingStack");
  });

  makeClickable("heroPaymentTile", () => {
    openStackSection("paymentStack");
  });
}

function setupMailButton(client) {
  const button = document.getElementById("mailButton");
  if (!button) return;

  const dateInput = document.getElementById("readingDate");
  if (dateInput && !dateInput.value) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    dateInput.value = `${y}-${m}-${d}`;
  }

  button.addEventListener("click", () => {
    const email = "pokaz@lk.atomsbt.ru";
    const electricity = document.getElementById("readingElectricity")?.value.trim() || "";
    const coldWater = document.getElementById("readingColdWater")?.value.trim() || "";
    const hotWater = document.getElementById("readingHotWater")?.value.trim() || "";
    const date = document.getElementById("readingDate")?.value || new Date().toLocaleDateString("ru-RU");

    const subject = "Передача показаний ЛС " + client.account;

    const body =
      "Лицевой счет: " + client.account + "\n\n" +
      "Электроснабжение: " + electricity + "\n" +
      "Холодная вода: " + coldWater + "\n" +
      "Горячая вода: " + hotWater + "\n\n" +
      "Дата передачи: " + date + "\n\n" +
      "Письмо сформировано автоматически со страницы «Так понятнее».";

    const mailto =
      "mailto:" + email +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);

    window.location.href = mailto;
  });
}
