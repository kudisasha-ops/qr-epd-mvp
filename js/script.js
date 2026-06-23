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

    document.getElementById("account").innerText =
      "Лицевой счет: " + client.account;

    document.getElementById("amount").innerText = client.amount;
    document.getElementById("debt").innerText = client.debt;
    document.getElementById("penalty").innerText = client.penalty;

    renderMonthMap(client);
    renderDebtHistory(client);
    renderReadingHistory(client, CURRENT_HISTORY_YEAR, false);
    renderPaymentHistory(client, CURRENT_HISTORY_YEAR, false);
    renderRestriction(client);
    renderServices(client.services || []);
    renderTimeline(client.events || [], client);
    setupMailButton(client);
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

function getHistoryItems(client, year) {
  if (year === CURRENT_HISTORY_YEAR) {
    return client.debtHistory || [];
  }

  return (client.previousYears && client.previousYears[year]) || [];
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
        renderReadingHistory(client, year, true);
      } else {
        renderPaymentHistory(client, year, true);
      }
    });
  });
}

function renderReadingHistory(client, year = CURRENT_HISTORY_YEAR, showAll = true) {
  const root = document.getElementById("readingHistory");
  if (!root) return;

  renderHistoryYearLinks("readingYearLinks", "reading", client, year, showAll);

  const allItems = getHistoryItems(client, year);
  const items = showAll ? allItems : allItems.slice(-1);

  if (!items.length) {
    root.innerHTML = '<div class="history-empty">История передачи показаний за выбранный год отсутствует.</div>';
    return;
  }

  root.innerHTML = items.map(item => `
    <details class="history-item">
      <summary>
        <span class="history-summary-title">${item.month}</span>
        <span class="history-summary-badge ${item.class || "info"}">${item.readingMethod === "показания не передавались" ? "Не переданы" : "Показания"}</span>
      </summary>
      <div class="history-content">
        <div class="history-row"><span>Когда переданы</span><b>${item.readingDate || "—"}</b></div>
        <div class="history-row"><span>Каким способом</span><b>${item.readingMethod || "—"}</b></div>
        <div class="history-row"><span>Какие показания</span><b>${item.readingValues || item.readingWhat || "—"}</b></div>
        <div class="history-row"><span>На какой месяц учтены</span><b>${item.readingAcceptedFor || item.month}</b></div>
      </div>
    </details>
  `).join("");
}

function renderPaymentHistory(client, year = CURRENT_HISTORY_YEAR, showAll = true) {
  const root = document.getElementById("paymentHistory");
  if (!root) return;

  renderHistoryYearLinks("paymentYearLinks", "payment", client, year, showAll);

  const allItems = getHistoryItems(client, year);
  const items = showAll ? allItems : allItems.slice(-1);

  if (!items.length) {
    root.innerHTML = '<div class="history-empty">История оплаты за выбранный год отсутствует.</div>';
    return;
  }

  root.innerHTML = items.map(item => `
    <details class="history-item">
      <summary>
        <span class="history-summary-title">${item.month}</span>
        <span class="history-summary-badge ${item.class || "info"}">${item.paymentDate === "—" ? "Не оплачено" : "Оплата"}</span>
      </summary>
      <div class="history-content">
        <div class="history-row"><span>Когда оплачено</span><b>${item.paymentDate || "—"}</b></div>
        <div class="history-row"><span>Каким способом</span><b>${item.paymentMethod || "—"}</b></div>
        <div class="history-row"><span>Какая сумма</span><b>${item.paymentAmount || item.paid || "—"}</b></div>
        <div class="history-row"><span>За какой месяц учтена</span><b>${item.paymentAppliedFor || item.month}</b></div>
      </div>
    </details>
  `).join("");
}

function renderDebtHistory(client) {
  const root = document.getElementById("debtHistory");
  const title = document.getElementById("debtSectionTitle");
  if (!root) return;

  const allItems = client.debtHistory || [];
  const hasDebt = parseMoney(client.debt) > 0 || allItems.some(item => parseMoney(item.balance) > 0);

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

  root.innerHTML = items.map(item => `
    <article class="debt-card ${item.class || "info"}">
      <div class="debt-head">
        <div class="debt-month">${item.month}</div>
        <div class="debt-status ${item.class || "info"}">${item.status}</div>
      </div>

      <div class="debt-grid">
        <div class="debt-cell">
          <span>Начислено</span>
          <strong>${item.charge}</strong>
          <small>Показания: ${item.readingDate || "—"}, ${item.readingMethod || "—"}</small>
          <small>${item.readingValues || item.readingWhat || ""}</small>
        </div>
        <div class="debt-cell">
          <span>Оплачено</span>
          <strong>${item.paid}</strong>
          <small>${item.paymentDate || "—"}, ${item.paymentMethod || "—"}</small>
          <small>Учтено за: ${item.paymentAppliedFor || item.month}</small>
        </div>
        <div class="debt-cell">
          <span>Осталось</span>
          <strong>${item.balance}</strong>
          <small>${item.note || "Недоплаты нет."}</small>
        </div>
      </div>
    </article>
  `).join("");
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

function renderServices(services) {
  const root = document.getElementById("servicesBreakdown");
  if (!root) return;

  if (!services.length) {
    root.innerHTML = '<div class="service-card"><div class="service-name">Нет данных по услугам</div></div>';
    return;
  }

  root.innerHTML = services.map(service => `
    <article class="service-card">
      <div class="service-top">
        <div class="service-name">${service.name}</div>
        <div class="service-amount">${service.amount}</div>
      </div>
      <div class="service-meta">
        <div><span>Начисление:</span> ${service.method}</div>
        <div><span>Объём и расчёт:</span> ${service.volume}</div>
        ${service.tariff && service.tariff !== "—" ? `<div><span>Тариф:</span> ${service.tariff}</div>` : ""}
      </div>
      <img class="service-illustration" src="${getServiceImage(service.name)}" alt="${service.name}">
    </article>
  `).join("");
}

function renderTimeline(events, client) {
  let html = "";

  events.forEach(event => {
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

    html += `
      <article class="event-card">
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

  if (!client.restriction || !client.restriction.active) {
    block.innerHTML = "";
    return;
  }

  const resource = client.restriction.serviceLabel || client.restriction.service || "услуга";
  const plannedDate = client.restriction.plannedDate || "не указана";

  block.innerHTML = `
    <section class="restriction">
      <div class="restriction-title">⚠ Планируемое ограничение</div>
      <p><b>Какая услуга:</b> ${resource}</p>
      <p><b>Причина:</b> ${client.restriction.reason}</p>
      <p><b>Дата уведомления:</b> ${client.restriction.noticeDate}</p>
      <p><b>Планируемая дата ограничения:</b> ${plannedDate}</p>
      <p><b>Что сделать:</b> оплатить задолженность или обратиться в центр обслуживания.</p>
    </section>
  `;
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
