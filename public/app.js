const state = {
  company: null,
  currentEmployee: null,
  currentMonth: '',
  currentTimesheet: null
};

const qs = (sel) => document.querySelector(sel);

function showNotice(el, message, kind = '') {
  el.textContent = message;
  el.className = `notice ${kind}`.trim();
  el.classList.remove('hidden');
}

function hideNotice(el) {
  el.classList.add('hidden');
  el.textContent = '';
}

function sanitizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function todayMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;
  if (!response.ok) {
    throw new Error(payload?.error || 'אירעה שגיאה.');
  }
  return payload;
}

async function uploadFile(url, file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || 'שגיאה בהעלאת קובץ.');
  return payload;
}

async function loadConfig() {
  const { company } = await api('/api/config');
  state.company = company;
  qs('#companyName').textContent = company.name;
  qs('#phonePill').textContent = `${company.phoneMain} עידן | ${company.phoneSecond} אייל`;
  qs('#emailPill').textContent = company.email;
  qs('#emailPill').href = `mailto:${company.email}`;
  qs('#addressPill').textContent = company.address;
  qs('#websitePill').textContent = company.website.replace(/^https?:\/\//, '');
  qs('#websitePill').href = company.website;
  const formLink = qs('#form101Link');
  if (formLink) formLink.href = company.form101Url || 'https://tpz.link/xb2jv';
  qs('#footerYear').textContent = new Date().getFullYear();
}

function setLoggedIn(employee) {
  state.currentEmployee = employee;
  localStorage.setItem('ara_employee_id', employee.idNumber);
  qs('#loginCard').classList.add('hidden');
  qs('#portalSection').classList.remove('hidden');
  qs('#employeeDisplayName').textContent = `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'עובד';
  populateProfile(employee);
}

function setLoggedOut() {
  state.currentEmployee = null;
  state.currentTimesheet = null;
  localStorage.removeItem('ara_employee_id');
  qs('#portalSection').classList.add('hidden');
  qs('#loginCard').classList.remove('hidden');
  qs('#loginIdNumber').value = '';
}

function populateProfile(employee) {
  qs('#firstName').value = employee.firstName || '';
  qs('#lastName').value = employee.lastName || '';
  qs('#idNumber').value = employee.idNumber || '';
  qs('#phone').value = employee.phone || '';
  qs('#email').value = employee.email || '';
  qs('#beneficiaryName').value = employee.beneficiaryName || '';
  qs('#bankName').value = employee.bankName || '';
  qs('#branchNumber').value = employee.branchNumber || '';
  qs('#bankAccount').value = employee.bankAccount || '';
  renderDocuments(employee.documents || {});
}

function renderDocuments(documents) {
  const idCard = documents.idCard;
  const tax = documents.taxCoordination;
  qs('#idCardMeta').innerHTML = idCard
    ? `הועלה: <a href="${idCard.url}" target="_blank" rel="noreferrer">${idCard.originalName}</a>`
    : 'עדיין לא הועלה קובץ';
  qs('#taxMeta').innerHTML = tax
    ? `הועלה: <a href="${tax.url}" target="_blank" rel="noreferrer">${tax.originalName}</a>`
    : 'עדיין לא הועלה קובץ';
}

function collectProfilePayload() {
  return {
    firstName: qs('#firstName').value.trim(),
    lastName: qs('#lastName').value.trim(),
    phone: qs('#phone').value.trim(),
    email: qs('#email').value.trim(),
    beneficiaryName: qs('#beneficiaryName').value.trim(),
    bankName: qs('#bankName').value.trim(),
    branchNumber: qs('#branchNumber').value.trim(),
    bankAccount: qs('#bankAccount').value.trim()
  };
}

async function login(idNumber) {
  const loginNotice = qs('#loginNotice');
  hideNotice(loginNotice);
  const payload = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ idNumber })
  });
  setLoggedIn(payload.employee);
  qs('#monthPicker').value = todayMonth();
  await loadMonth(qs('#monthPicker').value);
}

async function saveProfile() {
  const profileNotice = qs('#profileNotice');
  hideNotice(profileNotice);
  const payload = collectProfilePayload();
  const result = await api(`/api/employee/${state.currentEmployee.idNumber}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  state.currentEmployee = result.employee;
  setLoggedIn(result.employee);
  showNotice(profileNotice, 'פרטי העובד נשמרו בהצלחה.', 'ok');
  if (state.currentMonth) {
    await loadMonth(state.currentMonth);
  }
}

function renderTimesheet(timesheet) {
  state.currentTimesheet = timesheet;
  const tbody = qs('#timesheetBody');
  tbody.innerHTML = '';
  timesheet.rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.date}</td>
      <td><input type="time" data-field="startTime" data-index="${index}" value="${row.startTime || ''}" /></td>
      <td><input type="time" data-field="endTime" data-index="${index}" value="${row.endTime || ''}" /></td>
      <td><input type="text" data-field="note" data-index="${index}" value="${row.note || ''}" placeholder="הערה" /></td>
      <td>${row.totalHours ?? 0}</td>
      <td>${row.regularHours ?? 0}</td>
      <td>${row.overtime125Hours ?? 0}</td>
      <td>${row.overtime150Hours ?? 0}</td>
      <td><input type="number" min="0" step="0.01" data-field="travelAmount" data-index="${index}" value="${row.travelAmount ?? 0}" /></td>
      <td>₪${row.totalPay ?? 0}</td>
    `;
    tbody.appendChild(tr);
  });
  renderSummary(timesheet.summary);
  qs('#submitStamp').textContent = timesheet.submittedAt
    ? `החודש כבר נשלח בתאריך ${new Date(timesheet.submittedAt).toLocaleString('he-IL')}`
    : 'החודש עדיין לא נשלח.';
}

function renderSummary(summary) {
  qs('#sumWorkDays').textContent = summary.workDays ?? 0;
  qs('#sumTotalHours').textContent = summary.totalHours ?? 0;
  qs('#sumRegularHours').textContent = summary.regularHours ?? 0;
  qs('#sumOt125').textContent = summary.overtime125Hours ?? 0;
  qs('#sumOt150').textContent = summary.overtime150Hours ?? 0;
  qs('#sumTravelAmount').textContent = `₪${summary.travelAmount ?? 0}`;
  qs('#sumTotalPay').textContent = `₪${summary.totalPay ?? 0}`;
}

function collectRowsFromTable() {
  const rows = state.currentTimesheet?.rows?.map((row) => ({ ...row })) || [];
  document.querySelectorAll('#timesheetBody input').forEach((input) => {
    const index = Number(input.dataset.index);
    const field = input.dataset.field;
    rows[index][field] = input.value;
  });
  return rows;
}

async function loadMonth(month) {
  state.currentMonth = month;
  hideNotice(qs('#timesheetNotice'));
  const payload = await api(`/api/timesheet/${state.currentEmployee.idNumber}/${month}`);
  renderTimesheet(payload.timesheet);
}

async function saveTimesheet() {
  const timesheetNotice = qs('#timesheetNotice');
  hideNotice(timesheetNotice);
  const rows = collectRowsFromTable();
  const payload = await api(`/api/timesheet/${state.currentEmployee.idNumber}/${state.currentMonth}`, {
    method: 'PUT',
    body: JSON.stringify({ rows })
  });
  renderTimesheet(payload.timesheet);
  showNotice(timesheetNotice, 'טבלת השעות נשמרה בהצלחה.', 'ok');
}

async function submitMonth() {
  const timesheetNotice = qs('#timesheetNotice');
  hideNotice(timesheetNotice);
  await saveTimesheet();
  const payload = await api(`/api/timesheet/${state.currentEmployee.idNumber}/${state.currentMonth}/submit`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  showNotice(timesheetNotice, `החודש נשלח בהצלחה בתאריך ${new Date(payload.submittedAt).toLocaleString('he-IL')}.`, 'ok');
  await loadMonth(state.currentMonth);
}

async function uploadDocument(docType, fileInputId) {
  const filesNotice = qs('#filesNotice');
  hideNotice(filesNotice);
  const file = qs(`#${fileInputId}`).files[0];
  if (!file) {
    showNotice(filesNotice, 'יש לבחור קובץ לפני העלאה.', 'warn');
    return;
  }
  const result = await uploadFile(`/api/employee/${state.currentEmployee.idNumber}/upload/${docType}`, file);
  renderDocuments(result.documents || {});
  showNotice(filesNotice, 'הקובץ הועלה בהצלחה.', 'ok');
}

function bindEvents() {
  qs('#loginBtn').addEventListener('click', async () => {
    try {
      const idNumber = sanitizeDigits(qs('#loginIdNumber').value);
      if (idNumber.length < 5) {
        showNotice(qs('#loginNotice'), 'יש להזין תעודת זהות תקינה.', 'warn');
        return;
      }
      await login(idNumber);
    } catch (error) {
      showNotice(qs('#loginNotice'), error.message, 'warn');
    }
  });

  qs('#logoutBtn').addEventListener('click', () => setLoggedOut());

  qs('#saveProfileBtn').addEventListener('click', async () => {
    try {
      await saveProfile();
    } catch (error) {
      showNotice(qs('#profileNotice'), error.message, 'warn');
    }
  });

  qs('#loadMonthBtn').addEventListener('click', async () => {
    try {
      await loadMonth(qs('#monthPicker').value || todayMonth());
    } catch (error) {
      showNotice(qs('#timesheetNotice'), error.message, 'warn');
    }
  });

  qs('#saveTimesheetBtn').addEventListener('click', async () => {
    try {
      await saveTimesheet();
    } catch (error) {
      showNotice(qs('#timesheetNotice'), error.message, 'warn');
    }
  });

  qs('#submitMonthBtn').addEventListener('click', async () => {
    try {
      await submitMonth();
    } catch (error) {
      showNotice(qs('#timesheetNotice'), error.message, 'warn');
    }
  });

  qs('#uploadIdCardBtn').addEventListener('click', async () => {
    try {
      await uploadDocument('idCard', 'idCardFile');
    } catch (error) {
      showNotice(qs('#filesNotice'), error.message, 'warn');
    }
  });

  qs('#uploadTaxBtn').addEventListener('click', async () => {
    try {
      await uploadDocument('taxCoordination', 'taxFile');
    } catch (error) {
      showNotice(qs('#filesNotice'), error.message, 'warn');
    }
  });
}

(async function init() {
  try {
    await loadConfig();
    bindEvents();
    qs('#monthPicker').value = todayMonth();
    const cachedId = localStorage.getItem('ara_employee_id');
    if (cachedId) {
      try {
        await login(cachedId);
      } catch (_error) {
        localStorage.removeItem('ara_employee_id');
      }
    }
  } catch (error) {
    showNotice(qs('#loginNotice'), error.message || 'המערכת לא עלתה כראוי.', 'warn');
  }
})();
