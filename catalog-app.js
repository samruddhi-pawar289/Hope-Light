(() => {
  const app = document.getElementById('catalog-app');
  let activeApiBase = null;
  let allChildren = [];
  let searchQuery = '';

  const folderInfo = {
    medical: { title: 'Medical Records', description: 'Health profiles, growth and care notes', icon: '✚' },
    vaccination: { title: 'Vaccination Records', description: 'Immunizations and upcoming doses', icon: '✚' },
    checkups: { title: 'Previous Checkups', description: 'Past visits, vitals and doctor notes', icon: '▤' }
  };

  const esc = value => String(value ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = value => value ? new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value.includes('T') ? value : value + 'T00:00:00')) : '—';
  const initials = name => (name || '').split(' ').filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '—';
  const pill = (label, color = '') => `<span class="status-pill ${color}">${esc(label)}</span>`;
  const sortedCheckups = child => [...(child.checkups || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  function calculateAge(dob) {
    if (!dob) return null;
    try {
      const birth = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      return age >= 0 ? age : 0;
    } catch {
      return null;
    }
  }

  function healthStatus(child) {
    return child.status || 'Healthy';
  }

  function vaccineSummary(child) {
    const list = child.vaccinations || [];
    const done = list.filter(v => v.status === 'Given').length;
    const total = list.length;
    const overdue = list.some(v => v.status === 'Overdue');
    const due = list.some(v => v.status === 'Due');
    return {
      done,
      total,
      status: overdue ? 'Overdue' : due ? 'Due soon' : 'Up to date',
      color: overdue ? 'red' : due ? 'blue' : ''
    };
  }

  function recordsCount(folder) {
    return allChildren.reduce((n, c) => n + (folder === 'medical' ? ((c.history || []).length + (c.medicalData || []).length) : folder === 'vaccination' ? (c.vaccinations || []).length : (c.checkups || []).length), 0);
  }

  // Smart API Candidate Discovery
  function getCandidateApis() {
    const apis = [];
    if (window.HOPE_LIGHT_API) apis.push(window.HOPE_LIGHT_API);
    const loc = window.location;
    if (loc.pathname.includes('/Hope&Light/')) {
      apis.push(loc.origin + '/Hope&Light/api');
    }
    apis.push('http://localhost/Hope&Light/api');
    apis.push('http://127.0.0.1/Hope&Light/api');
    apis.push('http://127.0.0.1:5000/api');
    apis.push('/api');
    return Array.from(new Set(apis));
  }

  async function apiFetch(endpoint, options = {}) {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const candidates = activeApiBase ? [activeApiBase, ...getCandidateApis()] : getCandidateApis();

    for (const base of candidates) {
      try {
        const cleanBase = base.replace(/\/+$/, '');
        const res = await fetch(`${cleanBase}/${cleanEndpoint}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
          }
        });
        if (res.ok) {
          activeApiBase = cleanBase;
          window.HOPE_LIGHT_API = cleanBase;
          return res;
        }
      } catch {
        // Try next candidate
      }
    }
    throw new Error('All API endpoints unreachable');
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem('hope_light_children', JSON.stringify(allChildren));
      localStorage.setItem('hope_light_data_updated', String(Date.now()));
      window.dispatchEvent(new CustomEvent('hope_light:data_manipulated'));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  function loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem('hope_light_children');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) {
      console.warn('LocalStorage load failed:', e);
    }
    return null;
  }

  // Robust hash-based routing
  function route() {
    let hash = location.hash || '';
    if (hash.startsWith('#')) hash = hash.slice(1);
    hash = hash.trim();
    if (!hash || hash === '/' || hash === '') {
      return { page: 'folders' };
    }
    const match = hash.match(/^\/?folder\/(medical|vaccination|checkups)(?:\/([^/?#]+))?/);
    if (!match) return { page: 'folders' };
    return {
      page: match[2] ? 'detail' : 'table',
      folder: match[1],
      childId: match[2] ? decodeURIComponent(match[2]) : null
    };
  }

  function crumbs(folder, child) {
    return `<nav class="catalog-crumbs" aria-label="Breadcrumb">
      <a href="#/">← Back to Folders</a>
      <span>/</span>
      <a href="#/folder/${folder}">${esc(folderInfo[folder]?.title || folder)}</a>
      ${child ? `<span>/</span><span class="current">${esc(child.name)}</span>` : ''}
    </nav>`;
  }

  function foldersPage() {
    return `<section class="folder-grid">${Object.entries(folderInfo).map(([id, info]) => `
      <a class="folder-card folder-${id}" href="#/folder/${id}">
        <span class="folder-icon" aria-hidden="true">${info.icon}</span>
        <h2>${esc(info.title)}</h2>
        <p>${esc(info.description)}</p>
        <span class="record-badge">${recordsCount(id)} records</span>
      </a>`).join('')}</section>`;
  }

  function getFilteredChildren() {
    if (!searchQuery) return allChildren;
    const q = searchQuery.toLowerCase().trim();
    return allChildren.filter(c => 
      (c.name || '').toLowerCase().includes(q) || 
      (c.id || '').toLowerCase().includes(q) ||
      (c.ward || '').toLowerCase().includes(q) ||
      (c.bloodType || '').toLowerCase().includes(q)
    );
  }

  function tablePage(folder) {
    const displayed = getFilteredChildren();
    let headers, rows;
    if (folder === 'medical') {
      headers = ['NAME', 'AGE', 'WEIGHT', 'HEIGHT', 'ACTIONS', 'STATUS'];
      rows = displayed.map(c => [
        c.name,
        `${c.age ?? '—'} yrs`,
        `${c.weightKg || (c.history && c.history[0] ? c.history[0].weight : '—')} kg`,
        `${c.heightCm || (c.history && c.history[0] ? c.history[0].height : '—')} cm`,
        `<button class="action-btn delete-child" data-id="${c.id}" style="padding: 4px 10px; border-radius: 6px; border: 1px solid #e57373; background: #ffebee; color: #c62828; cursor: pointer; font-size: 12px;">Delete</button>`,
        pill(healthStatus(c), c.status === 'Under Treatment' ? 'orange' : c.status === 'Monitoring' ? 'blue' : c.status === 'Critical' ? 'red' : '')
      ]);
    } else if (folder === 'vaccination') {
      headers = ['NAME', 'AGE', 'VACCINES DONE', 'LAST VACCINE', 'NEXT DUE', 'ACTIONS', 'STATUS'];
      rows = displayed.map(c => {
        const v = vaccineSummary(c);
        const vacs = c.vaccinations || [];
        const last = vacs.filter(x => x.status === 'Given' && x.dateGiven).sort((a, b) => (b.dateGiven || '').localeCompare(a.dateGiven || ''))[0];
        const next = vacs.filter(x => x.status !== 'Given').sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))[0];
        return [
          c.name,
          `${c.age ?? '—'} yrs`,
          `${v.done} / ${v.total}`,
          date(last?.dateGiven),
          date(next?.dueDate),
          `<button class="action-btn delete-child" data-id="${c.id}" style="padding: 4px 10px; border-radius: 6px; border: 1px solid #e57373; background: #ffebee; color: #c62828; cursor: pointer; font-size: 12px;">Delete</button>`,
          pill(v.status, v.color)
        ];
      });
    } else {
      headers = ['NAME', 'AGE', 'LAST CHECKUP', 'DOCTOR', 'ACTIONS', 'STATUS'];
      rows = displayed.map(c => {
        const latest = sortedCheckups(c)[0];
        const status = c.status;
        return [
          c.name,
          `${c.age ?? '—'} yrs`,
          date(latest?.date),
          latest?.doctor || '—',
          `<button class="action-btn delete-child" data-id="${c.id}" style="padding: 4px 10px; border-radius: 6px; border: 1px solid #e57373; background: #ffebee; color: #c62828; cursor: pointer; font-size: 12px;">Delete</button>`,
          pill(status, status === 'Under Treatment' ? 'orange' : status === 'Monitoring' ? 'blue' : status === 'Critical' ? 'red' : '')
        ];
      });
    }

    const searchHtml = `<div class="search-container" style="margin-bottom: 20px;"><input type="text" id="searchInput" value="${esc(searchQuery)}" placeholder="Search by name or ID..." style="width: 100%; padding: 12px; border-radius: 20px; border: 1px solid #ddd9d1; font-family: 'DM Sans', sans-serif; font-size: 15px; outline: none; box-sizing: border-box;"></div>`;
    return `${crumbs(folder)}<section class="catalog-panel" style="position:relative">
      <button id="addChildBtn" style="position:absolute; top:20px; right:20px; padding: 10px 20px; border-radius: 20px; background-color: #0f684a; color: white; border: none; font-family: 'DM Sans', sans-serif; cursor: pointer; font-weight: 500;">+ Add Child</button>
      <div class="panel-heading">
        <div>
          <span class="mono-label">CHILD RECORDS</span>
          <h2>${esc(folderInfo[folder].title)}</h2>
          <p>${esc(folderInfo[folder].description)}</p>
        </div>
        <span class="records-count">${displayed.length} children</span>
      </div>
      ${searchHtml}
      ${displayed.length ? `
        <div class="table-wrap">
          <table class="catalog-table">
            <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${displayed.map((c, i) => `
              <tr data-href="#/folder/${folder}/${encodeURIComponent(c.id)}">
                ${rows[i].map((v, j) => `<td class="${j === 0 ? 'child-name' : ''}">${v}</td>`).join('')}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `<div class="empty-state">${searchQuery ? 'No matching children found for "' + esc(searchQuery) + '"' : 'No records are available in this folder yet.'}</div>`}
    </section>`;
  }

  function profile(child, currentFolder) {
    const editBtn = `<button id="editBtn" style="width: 100%; padding: 10px; margin-top: 15px; border-radius: 20px; background-color: #0f684a; color: white; border: none; font-family: 'DM Sans', sans-serif; cursor: pointer; font-weight: 500;">Edit Profile</button>`;

    // Quick direct tabs to switch between the 3 containers for this child
    const folderTabs = `
      <div class="child-container-tabs" style="margin-top: 20px; display: flex; flex-direction: column; gap: 8px;">
        <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">RECORD CONTAINERS</span>
        <a href="#/folder/medical/${encodeURIComponent(child.id)}" style="display:flex; align-items:center; gap:8px; padding: 8px 12px; border-radius: 8px; text-decoration:none; font-size: 13px; font-weight: 500; ${currentFolder === 'medical' ? 'background: #e6f4ea; color: #0f684a; font-weight:600;' : 'color: #334155; background: #f8fafc;'}">✚ Medical Reports & Growth</a>
        <a href="#/folder/vaccination/${encodeURIComponent(child.id)}" style="display:flex; align-items:center; gap:8px; padding: 8px 12px; border-radius: 8px; text-decoration:none; font-size: 13px; font-weight: 500; ${currentFolder === 'vaccination' ? 'background: #e6f4ea; color: #0f684a; font-weight:600;' : 'color: #334155; background: #f8fafc;'}">✚ Vaccination Records</a>
        <a href="#/folder/checkups/${encodeURIComponent(child.id)}" style="display:flex; align-items:center; gap:8px; padding: 8px 12px; border-radius: 8px; text-decoration:none; font-size: 13px; font-weight: 500; ${currentFolder === 'checkups' ? 'background: #e6f4ea; color: #0f684a; font-weight:600;' : 'color: #334155; background: #f8fafc;'}">▤ Previous Checkups</a>
      </div>
      <div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
        <a href="#/folder/${currentFolder}" style="display:inline-flex; align-items:center; gap:6px; color:#0f684a; text-decoration:none; font-size:13px; font-weight:500;">← Back to ${esc(folderInfo[currentFolder]?.title || currentFolder)} List</a>
      </div>
    `;

    return `<aside class="profile-card">
      <div class="profile-avatar">${initials(child.name)}</div>
      <div>
        <h2>${esc(child.name)}</h2>
        <div class="profile-status">${pill(child.status, child.status === 'Under Treatment' ? 'orange' : child.status === 'Monitoring' ? 'blue' : child.status === 'Critical' ? 'red' : '')}</div>
      </div>
      <dl class="profile-meta">
        <div><dt>DATE OF BIRTH</dt><dd>${date(child.dob)}</dd></div>
        <div><dt>AGE</dt><dd>${child.age ?? '—'} years</dd></div>
        <div><dt>BLOOD TYPE</dt><dd>${esc(child.bloodType)}</dd></div>
        <div><dt>WARD</dt><dd>${esc(child.ward)}</dd></div>
        <div><dt>ADMITTED</dt><dd>${date(child.admitted)}</dd></div>
      </dl>
      ${editBtn}
      ${folderTabs}
    </aside>`;
  }

  function vaccinationPanel(child) {
    const list = child.vaccinations || [];
    const done = list.filter(v => v.status === 'Given').length;
    const filter = `<div class="filter-tabs" role="group" aria-label="Filter vaccinations"><button class="active" data-filter="All">All</button><button data-filter="Given">Given</button><button data-filter="Upcoming">Upcoming</button></div>`;
    const items = list.map(v => `<tr data-vaccine-status="${v.status === 'Given' ? 'Given' : 'Upcoming'}">
      <td>${esc(v.vaccine)}</td>
      <td>${esc(v.dose)}</td>
      <td>${date(v.dateGiven)}</td>
      <td>${date(v.dueDate)}</td>
      <td>${pill(v.status, v.status === 'Overdue' ? 'red' : v.status === 'Due' ? 'blue' : '')}</td>
      <td><button class="action-btn delete-vac" data-id="${v.id || v.vaccine}" style="padding: 4px 10px; border-radius: 6px; border: 1px solid #e57373; background: #ffebee; color: #c62828; cursor: pointer; font-size: 12px;">Delete</button></td>
    </tr>`).join('');
    const addVacBtn = `<button id="addVacBtn" style="position:absolute; top:20px; right:20px; padding: 10px 20px; border-radius: 20px; background-color: #0f684a; color: white; border: none; font-family: 'DM Sans', sans-serif; cursor: pointer; font-weight: 500;">+ Add Vaccine</button>`;
    const pct = list.length ? Math.round(done / list.length * 100) : 0;
    return `<section class="catalog-panel detail-panel" style="position:relative">
      ${addVacBtn}
      <div class="panel-heading">
        <div>
          <span class="mono-label">VACCINATION RECORDS</span>
          <h2>Immunization Schedule</h2>
          <p class="panel-subtitle">Doses given and upcoming</p>
        </div>
      </div>
      <div class="progress-copy">
        <span>${done} of ${list.length} vaccines completed</span>
        <strong>${pct}%</strong>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      ${filter}
      ${list.length ? `
        <div class="table-wrap">
          <table class="catalog-table">
            <thead><tr><th>VACCINE</th><th>DOSE</th><th>DATE GIVEN</th><th>DUE DATE</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
            <tbody>${items}</tbody>
          </table>
        </div>` : `<div class="empty-state">No vaccination records are available yet.</div>`}
    </section>`;
  }

  function checkupPanel(child) {
    const list = sortedCheckups(child);
    const years = ['All', ...Array.from(new Set(list.map(x => (x.date || '').slice(0, 4)).filter(Boolean)))];
    const newest = list[0];
    const next = newest?.followUp || '—';
    const filters = `<div class="filter-tabs" role="group" aria-label="Filter checkups">${years.map((y, i) => `<button class="${i === 0 ? 'active' : ''}" data-filter="${y}">${y}</button>`).join('')}</div>`;
    const entries = list.map((v, i) => `
      <article class="timeline-item" data-year="${(v.date || '').slice(0, 4)}">
        <details ${i === 0 ? 'open' : ''}>
          <summary>
            <strong>${date(v.date)}</strong>
            <span>${esc(v.doctor || 'Clinician')}</span>
            <button class="delete-checkup" data-id="${v.id || v.date}" style="margin-left: 10px; color:#c62828; background:none; border:none; cursor:pointer; font-size:12px;">Delete</button>
          </summary>
          <div class="timeline-body">
            <p class="timeline-doctor">${esc(v.doctor || 'Clinician')} · <span style="font-weight:600; color:#0f684a;">${esc(v.type || 'Routine')}</span></p>
            <div class="vitals-grid">
              <div class="vital"><span>WEIGHT</span><strong>${v.weightKg || '—'} kg</strong></div>
              <div class="vital"><span>HEIGHT</span><strong>${v.heightCm || '—'} cm</strong></div>
              <div class="vital"><span>BP</span><strong>${esc(v.bp || '—')}</strong></div>
              <div class="vital"><span>TEMP</span><strong>${v.temperatureC ? v.temperatureC + '°C' : '—'}</strong></div>
              <div class="vital"><span>PULSE</span><strong>${v.pulse ? v.pulse + ' bpm' : '—'}</strong></div>
            </div>
            <p class="finding"><strong>Findings:</strong> ${esc(v.findings || 'No acute concerns.')}</p>
            <p class="follow-up"><strong>Follow-up:</strong> ${esc(v.followUp || 'As needed.')}</p>
          </div>
        </details>
      </article>`).join('');
    const addCheckBtn = `<button id="addCheckBtn" style="position:absolute; top:20px; right:20px; padding: 10px 20px; border-radius: 20px; background-color: #0f684a; color: white; border: none; font-family: 'DM Sans', sans-serif; cursor: pointer; font-weight: 500;">+ Add Checkup</button>`;
    return `<section class="catalog-panel detail-panel" style="position:relative">
      ${addCheckBtn}
      <div class="panel-heading">
        <div>
          <span class="mono-label">VISIT HISTORY</span>
          <h2>Checkup History</h2>
          <p class="panel-subtitle">Previous visits, newest first</p>
        </div>
      </div>
      <div class="summary-strip">
        <div class="summary-item"><span>TOTAL CHECKUPS</span><strong>${list.length}</strong></div>
        <div class="summary-item"><span>LAST VISIT</span><strong>${date(newest?.date)}</strong></div>
        <div class="summary-item"><span>NEXT FOLLOW-UP</span><strong>${esc(next)}</strong></div>
      </div>
      ${filters}
      ${list.length ? `<div class="timeline">${entries}</div>` : `<div class="empty-state">No checkup records are available yet.</div>`}
    </section>`;
  }

  function medicalPanel(child) {
    const points = [...(child.history || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const width = 700, height = 220, pad = 34;
    const series = (key, color) => {
      const vals = points.map(p => p[key]);
      const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
      const xy = vals.map((v, i) => ({
        x: pad + i * (width - 2 * pad) / Math.max(1, vals.length - 1),
        y: height - pad - (v - min + range * 0.12) / (range * 1.24) * (height - 2 * pad)
      }));
      return `<polyline points="${xy.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle-group>${xy.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}"/>`).join('')}</circle-group>`;
    };

    const addGrowthBtn = `<button id="addGrowthBtn" style="padding: 6px 14px; margin-bottom: 12px; border-radius: 20px; background-color: #0f684a; color: white; border: none; font-family: 'DM Sans', sans-serif; cursor: pointer; font-size: 13px; font-weight: 500;">+ Add Growth Record</button>`;

    const mhd = child.medicalData || [];
    const addMhdBtn = `<button id="addMhdBtn" style="padding: 6px 14px; margin-bottom: 12px; border-radius: 20px; background-color: #0f684a; color: white; border: none; font-family: 'DM Sans', sans-serif; cursor: pointer; font-size: 13px; font-weight: 500;">+ Add Medical Report</button>`;
    const mhdItems = mhd.map(m => `
      <div style="border: 1px solid #ddd9d1; border-radius: 12px; padding: 14px; margin-bottom: 10px; position:relative; background:#faf9f6;">
        <span style="position:absolute; top:12px; right:12px;"><button class="delete-mhd" data-id="${m.id}" style="color:#c62828; background:none; border:none; cursor:pointer; font-size:12px;">Delete</button></span>
        <strong>${date(m.date)} — ${esc(m.type)}</strong>
        <p style="margin: 6px 0 0; color: #4d554f; font-size: 14px;">${esc(m.description)}</p>
        ${m.fileUrl ? `<img src="${esc(m.fileUrl)}" alt="Attachment" style="max-width: 100%; max-height: 200px; border-radius: 8px; margin-top: 10px; display:block;" />` : ''}
      </div>`).join('');
    const mhdSection = `<div style="margin-top: 30px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;"><h3 style="font-family: 'Playfair Display', Georgia, serif; font-size: 19px; color: #173d34; margin:0;">Medical Reports & Documents</h3>${addMhdBtn}</div>${mhdItems || '<p class="empty-state">No medical reports or documents uploaded yet.</p>'}</div>`;

    const history = points.slice().reverse().map(h => `
      <div class="summary-item" style="position:relative;">
        <span style="position:absolute; top:8px; right:8px;"><button class="delete-growth" data-id="${h.id || ''}" data-date="${h.date}" style="color:#c62828; background:none; border:none; cursor:pointer; font-size:11px;">Delete</button></span>
        <span>${date(h.date)}</span>
        <strong>${h.weight} kg · ${h.height} cm</strong>
        <p class="finding">${esc(h.note)}</p>
      </div>`).join('');

    return `<section class="catalog-panel detail-panel" style="position:relative">
      <div class="panel-heading">
        <div>
          <span class="mono-label">GROWTH &amp; HEALTH DATA</span>
          <h2>Medical & Growth History</h2>
          <p class="panel-subtitle">Weight, height measurements and health notes over time</p>
        </div>
      </div>
      <div style="margin-bottom: 15px;">${addGrowthBtn}</div>
      <div class="chart-legend">
        <span><i class="weight-dot"></i>Weight (kg)</span>
        <span><i class="height-dot"></i>Height (cm)</span>
      </div>
      <div class="growth-chart">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Weight and height trend">
          <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#ddd9d1"/>
          ${points.length > 1 ? series('weight', '#0f684a') : ''}
          ${points.length > 1 ? series('height', '#147463') : ''}
          ${points.map((p, i) => `<text x="${pad + i * (width - 2 * pad) / Math.max(1, points.length - 1)}" y="${height - 8}" text-anchor="middle">${date(p.date).split(' ').slice(0, 2).join(' ')}</text>`).join('')}
        </svg>
      </div>
      <div class="summary-strip">${history || '<div class="empty-state">No growth measurements recorded yet.</div>'}</div>
      ${mhdSection}
    </section>`;
  }

  function detailPage(folder, id) {
    const child = allChildren.find(c => String(c.id).toLowerCase() === String(id).toLowerCase());
    if (!child) {
      return `${crumbs(folder)}<div class="catalog-panel"><div class="empty-state">Child record "${esc(id)}" could not be found. <br><a href="#/folder/${folder}" style="color:#0f684a; font-weight:600; margin-top:10px; display:inline-block;">← Return to ${esc(folderInfo[folder]?.title || folder)}</a></div></div>`;
    }
    const panel = folder === 'vaccination' ? vaccinationPanel(child) : folder === 'checkups' ? checkupPanel(child) : medicalPanel(child);
    return `${crumbs(folder, child)}<div class="detail-layout">${profile(child, folder)}${panel}</div>`;
  }

  function render() {
    const r = route();

    // Find current child if on detail page
    const currentChild = r.childId ? allChildren.find(c => String(c.id).toLowerCase() === String(r.childId).toLowerCase()) : null;

    const dynamicModals = `
    <!-- Add Child Modal -->
    <dialog id="addChildModal" style="border: none; border-radius: 20px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); width: 440px; max-width: 90vw; margin: auto; z-index: 1000;">
      <h2 style="font-family: 'Playfair Display', Georgia, serif; margin-bottom: 20px; color: #173d34;">Add Child Profile</h2>
      <form id="addChildForm">
        <div style="margin-bottom: 12px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Full Name *</label><input type="text" name="name" required placeholder="e.g. Maya Sharma" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="display:flex; gap:10px; margin-bottom: 12px;">
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">DOB (YYYY-MM-DD) *</label><input type="date" name="dob" required style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Blood Type</label><input type="text" name="bloodType" placeholder="e.g. O+, A+" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        </div>
        <div style="display:flex; gap:10px; margin-bottom: 12px;">
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Ward</label><input type="text" name="ward" placeholder="e.g. Sunrise Ward" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Health Status</label><select name="status" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"><option value="Healthy">Healthy</option><option value="Monitoring">Monitoring</option><option value="Under Treatment">Under Treatment</option><option value="Critical">Critical</option></select></div>
        </div>
        <div style="display:flex; gap:10px; margin-bottom: 12px;">
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Initial Weight (kg)</label><input type="number" step="0.1" name="weightKg" placeholder="e.g. 28.5" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Initial Height (cm)</label><input type="number" step="0.5" name="heightCm" placeholder="e.g. 132" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button type="button" class="closeModal" style="padding: 8px 16px; border-radius: 20px; border: 1px solid #ccc; background: white; cursor: pointer;">Cancel</button>
          <button type="submit" style="padding: 8px 16px; border-radius: 20px; border: none; background: #0f684a; color: white; cursor: pointer; font-weight:500;">Save Child</button>
        </div>
      </form>
    </dialog>

    <!-- Edit Child Modal -->
    <dialog id="editModal" style="border: none; border-radius: 20px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); width: 420px; max-width: 90vw; margin: auto; z-index: 1000;">
      <h2 style="font-family: 'Playfair Display', Georgia, serif; margin-bottom: 20px; color: #173d34;">Edit Profile</h2>
      <form id="editForm">
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Name</label><input type="text" name="name" value="${currentChild ? esc(currentChild.name) : ''}" required style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">DOB</label><input type="date" name="dob" value="${currentChild && currentChild.dob ? esc(currentChild.dob.split('T')[0]) : ''}" required style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Blood Type</label><input type="text" name="bloodType" value="${currentChild ? esc(currentChild.bloodType) : ''}" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Ward</label><input type="text" name="ward" value="${currentChild ? esc(currentChild.ward) : ''}" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Status</label>
          <select name="status" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;">
            <option value="Healthy" ${currentChild?.status === 'Healthy' ? 'selected' : ''}>Healthy</option>
            <option value="Monitoring" ${currentChild?.status === 'Monitoring' ? 'selected' : ''}>Monitoring</option>
            <option value="Under Treatment" ${currentChild?.status === 'Under Treatment' ? 'selected' : ''}>Under Treatment</option>
            <option value="Critical" ${currentChild?.status === 'Critical' ? 'selected' : ''}>Critical</option>
          </select>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button type="button" class="closeModal" style="padding: 8px 16px; border-radius: 20px; border: 1px solid #ccc; background: white; cursor: pointer;">Cancel</button>
          <button type="submit" style="padding: 8px 16px; border-radius: 20px; border: none; background: #0f684a; color: white; cursor: pointer; font-weight:500;">Save Changes</button>
        </div>
      </form>
    </dialog>

    <!-- Add Vaccine Modal -->
    <dialog id="addVacModal" style="border: none; border-radius: 20px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); width: 400px; max-width: 90vw; margin: auto; z-index: 1000;">
      <h2 style="font-family: 'Playfair Display', Georgia, serif; margin-bottom: 20px; color: #173d34;">Add Vaccine</h2>
      <form id="addVacForm">
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Vaccine Name *</label><input type="text" name="vaccine" placeholder="e.g. MMR, Hepatitis B" required style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Dose Number *</label><input type="number" name="dose" value="1" min="1" required style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Date Given</label><input type="date" name="dateGiven" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Due Date</label><input type="date" name="dueDate" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Status</label>
          <select name="status" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;">
            <option value="Given">Given</option>
            <option value="Due">Due</option>
            <option value="Overdue">Overdue</option>
          </select>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button type="button" class="closeModal" style="padding: 8px 16px; border-radius: 20px; border: 1px solid #ccc; background: white; cursor: pointer;">Cancel</button>
          <button type="submit" style="padding: 8px 16px; border-radius: 20px; border: none; background: #0f684a; color: white; cursor: pointer; font-weight:500;">Save Vaccine</button>
        </div>
      </form>
    </dialog>

    <!-- Add Checkup Modal -->
    <dialog id="addCheckModal" style="border: none; border-radius: 20px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); width: 440px; max-width: 90vw; margin: auto; z-index: 1000;">
      <h2 style="font-family: 'Playfair Display', Georgia, serif; margin-bottom: 20px; color: #173d34;">Add Visit / Checkup</h2>
      <form id="addCheckForm">
        <div style="display:flex; gap:10px; margin-bottom: 12px;">
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Visit Date *</label><input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Visit Type</label>
            <select name="type" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;">
              <option value="Routine">Routine</option>
              <option value="Sick Visit">Sick Visit</option>
              <option value="Annual Physical">Annual Physical</option>
              <option value="Follow-up">Follow-up</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom: 12px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Doctor / Clinician</label><input type="text" name="doctor" placeholder="Dr. Amelia / Dr. Kwame" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="display:flex; gap:10px; margin-bottom: 12px;">
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Weight (kg)</label><input type="number" step="0.1" name="weightKg" placeholder="e.g. 42.5" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Height (cm)</label><input type="number" step="0.5" name="heightCm" placeholder="e.g. 150" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        </div>
        <div style="display:flex; gap:10px; margin-bottom: 12px;">
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Blood Pressure</label><input type="text" name="bp" placeholder="110/70" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Temp (°C)</label><input type="number" step="0.1" name="temperatureC" placeholder="36.6" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Pulse (bpm)</label><input type="number" name="pulse" placeholder="80" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        </div>
        <div style="margin-bottom: 12px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Findings / Observations</label><textarea name="findings" rows="2" placeholder="Healthy growth; normal vitals..." style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></textarea></div>
        <div style="margin-bottom: 12px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 4px;">Follow-up Plan</label><input type="text" name="followUp" placeholder="Review in 6 months" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button type="button" class="closeModal" style="padding: 8px 16px; border-radius: 20px; border: 1px solid #ccc; background: white; cursor: pointer;">Cancel</button>
          <button type="submit" style="padding: 8px 16px; border-radius: 20px; border: none; background: #0f684a; color: white; cursor: pointer; font-weight:500;">Save Checkup</button>
        </div>
      </form>
    </dialog>

    <!-- Add Growth Record Modal -->
    <dialog id="addGrowthModal" style="border: none; border-radius: 20px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); width: 400px; max-width: 90vw; margin: auto; z-index: 1000;">
      <h2 style="font-family: 'Playfair Display', Georgia, serif; margin-bottom: 20px; color: #173d34;">Add Growth Record</h2>
      <form id="addGrowthForm">
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Date *</label><input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="display:flex; gap:10px; margin-bottom: 15px;">
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Weight (kg) *</label><input type="number" step="0.1" name="weight" required placeholder="e.g. 43.2" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
          <div style="flex:1;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Height (cm) *</label><input type="number" step="0.5" name="height" required placeholder="e.g. 152" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        </div>
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Care / Progress Note</label><textarea name="note" rows="3" placeholder="Routine physical growth tracking..." style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></textarea></div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button type="button" class="closeModal" style="padding: 8px 16px; border-radius: 20px; border: 1px solid #ccc; background: white; cursor: pointer;">Cancel</button>
          <button type="submit" style="padding: 8px 16px; border-radius: 20px; border: none; background: #0f684a; color: white; cursor: pointer; font-weight:500;">Save Growth</button>
        </div>
      </form>
    </dialog>
    
    <!-- Add Medical Document Modal -->
    <dialog id="addMhdModal" style="border: none; border-radius: 20px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); width: 400px; max-width: 90vw; margin: auto; z-index: 1000;">
      <h2 style="font-family: 'Playfair Display', Georgia, serif; margin-bottom: 20px; color: #173d34;">Add Medical Report / Data</h2>
      <form id="addMhdForm">
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Date *</label><input type="date" name="date" required value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Report Type</label><select name="type" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"><option>Prescription</option><option>Lab Report</option><option>Photo</option><option>Diagnostic Report</option><option>Clinical Note</option></select></div>
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Description</label><textarea name="description" rows="3" placeholder="Details of diagnosis, prescribed medication, or report summary..." style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></textarea></div>
        <div style="margin-bottom: 15px;"><label style="display:block; font-size: 12px; font-weight:600; color: #102f43; margin-bottom: 5px;">Document / Attachment URL</label><input type="text" name="fileUrl" placeholder="https://... or file path" style="width:100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box;"></div>
        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button type="button" class="closeModal" style="padding: 8px 16px; border-radius: 20px; border: 1px solid #ccc; background: white; cursor: pointer;">Cancel</button>
          <button type="submit" style="padding: 8px 16px; border-radius: 20px; border: none; background: #0f684a; color: white; cursor: pointer; font-weight:500;">Save Report</button>
        </div>
      </form>
    </dialog>`;

    const pageContent = r.page === 'folders' ? foldersPage() : r.page === 'table' ? tablePage(r.folder) : detailPage(r.folder, r.childId);
    app.innerHTML = pageContent + dynamicModals;

    // Row clicks in table page
    app.querySelectorAll('[data-href]').forEach(row => row.addEventListener('click', (e) => {
      if (!e.target.closest('button')) navigate(row.dataset.href);
    }));

    // Filter tabs for vaccines and checkups
    app.querySelectorAll('.filter-tabs button').forEach(button => button.addEventListener('click', () => {
      const group = button.parentElement;
      group.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === button));
      const panel = button.closest('.detail-panel');
      if (!panel) return;
      if (panel.querySelector('[data-vaccine-status]')) {
        panel.querySelectorAll('[data-vaccine-status]').forEach(row => row.hidden = button.dataset.filter !== 'All' && row.dataset.vaccineStatus !== button.dataset.filter);
      }
      if (panel.querySelector('.timeline-item')) {
        panel.querySelectorAll('.timeline-item').forEach(item => item.hidden = button.dataset.filter !== 'All' && item.dataset.year !== button.dataset.filter);
      }
    }));

    // Search input (instant client-side filtering + backend debounce)
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        const cursorPos = e.target.selectionStart;
        render();
        const reloadedInp = document.getElementById('searchInput');
        if (reloadedInp) {
          reloadedInp.focus();
          try { reloadedInp.setSelectionRange(cursorPos, cursorPos); } catch {}
        }
      });
    }

    // Modal close buttons (all modals)
    app.querySelectorAll('.closeModal').forEach(b => b.addEventListener('click', (e) => {
      const dlg = e.target.closest('dialog');
      if (dlg) dlg.close();
    }));

    // Delete Child button
    app.querySelectorAll('.delete-child').forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = e.target.dataset.id;
      if (confirm('Delete this child record permanently from database?')) {
        try {
          await apiFetch(`children/${encodeURIComponent(id)}`, { method: 'DELETE' });
        } catch (err) {
          console.warn('API error during child deletion:', err);
        }
        allChildren = allChildren.filter(c => String(c.id).toLowerCase() !== String(id).toLowerCase());
        saveToLocalStorage();
        render();
      }
    }));

    // Delete Vaccine button
    app.querySelectorAll('.delete-vac').forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = e.target.dataset.id;
      if (confirm('Delete this vaccination record?')) {
        try {
          if (!isNaN(id)) {
            await apiFetch(`vaccinations/${id}`, { method: 'DELETE' });
          }
        } catch (err) {
          console.warn('API error during vaccination deletion:', err);
        }
        if (r.childId && currentChild && currentChild.vaccinations) {
          currentChild.vaccinations = currentChild.vaccinations.filter(v => String(v.id || v.vaccine) !== String(id));
          saveToLocalStorage();
        }
        render();
      }
    }));

    // Delete Checkup button
    app.querySelectorAll('.delete-checkup').forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = e.target.dataset.id;
      if (confirm('Delete this checkup record?')) {
        try {
          if (!isNaN(id)) {
            await apiFetch(`checkups/${id}`, { method: 'DELETE' });
          }
        } catch (err) {
          console.warn('API error during checkup deletion:', err);
        }
        if (r.childId && currentChild && currentChild.checkups) {
          currentChild.checkups = currentChild.checkups.filter(chk => String(chk.id || chk.date) !== String(id));
          saveToLocalStorage();
        }
        render();
      }
    }));

    // Delete Growth Record button
    app.querySelectorAll('.delete-growth').forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = e.target.dataset.id;
      const gDate = e.target.dataset.date;
      if (confirm('Delete this growth measurement?')) {
        try {
          if (id && !isNaN(id)) {
            await apiFetch(`growth/${id}`, { method: 'DELETE' });
          }
        } catch (err) {
          console.warn('API error during growth deletion:', err);
        }
        if (r.childId && currentChild && currentChild.history) {
          currentChild.history = currentChild.history.filter(h => String(h.id || h.date) !== String(id || gDate));
          if (currentChild.history.length > 0) {
            currentChild.weightKg = currentChild.history[0].weight;
            currentChild.heightCm = currentChild.history[0].height;
          }
          saveToLocalStorage();
        }
        render();
      }
    }));

    // Delete Medical History Data button
    app.querySelectorAll('.delete-mhd').forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = e.target.dataset.id;
      if (confirm('Delete this medical report record?')) {
        try {
          if (!isNaN(id)) {
            await apiFetch(`medical_history/${id}`, { method: 'DELETE' });
          }
        } catch (err) {
          console.warn('API error during medical report deletion:', err);
        }
        if (r.childId && currentChild && currentChild.medicalData) {
          currentChild.medicalData = currentChild.medicalData.filter(m => String(m.id) !== String(id));
          saveToLocalStorage();
        }
        render();
      }
    }));

    // Add Child button & form
    const addChildBtn = document.getElementById('addChildBtn');
    const addChildModal = document.getElementById('addChildModal');
    if (addChildBtn && addChildModal) {
      addChildBtn.addEventListener('click', () => addChildModal.showModal());
    }
    const addChildForm = document.getElementById('addChildForm');
    if (addChildForm) {
      addChildForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        let createdId = null;

        try {
          const res = await apiFetch('children', {
            method: 'POST',
            body: JSON.stringify(data)
          });
          const resData = await res.json();
          createdId = resData.id;
        } catch (err) {
          console.warn('API error when adding child:', err);
        }

        if (!createdId) {
          const clean = (data.name || 'child').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          createdId = clean + '-' + Date.now().toString().slice(-4);
        }

        const newChild = {
          id: createdId,
          name: data.name,
          dob: data.dob,
          age: calculateAge(data.dob),
          bloodType: data.bloodType || 'O+',
          ward: data.ward || 'General Ward',
          admitted: new Date().toISOString().split('T')[0],
          status: data.status || 'Healthy',
          weightKg: data.weightKg ? parseFloat(data.weightKg) : null,
          heightCm: data.heightCm ? parseFloat(data.heightCm) : null,
          history: (data.weightKg || data.heightCm) ? [{
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            weight: parseFloat(data.weightKg || 0),
            height: parseFloat(data.heightCm || 0),
            note: 'Initial intake record'
          }] : [],
          vaccinations: [],
          checkups: [],
          medicalData: []
        };

        // Push to top of list
        allChildren.unshift(newChild);
        saveToLocalStorage();

        if (addChildModal) addChildModal.close();
        render();

        // Refresh from backend to sync auto-generated IDs
        setTimeout(() => loadChildren(false), 500);
      });
    }

    // Edit Profile Modal
    const editBtn = document.getElementById('editBtn');
    const editModal = document.getElementById('editModal');
    if (editBtn && editModal) {
      editBtn.addEventListener('click', () => editModal.showModal());
      const editForm = document.getElementById('editForm');
      if (editForm) {
        editForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const data = Object.fromEntries(new FormData(e.target).entries());
          try {
            await apiFetch(`children/${encodeURIComponent(r.childId)}`, {
              method: 'PUT',
              body: JSON.stringify(data)
            });
          } catch (err) {
            console.warn('API error when editing profile:', err);
          }
          if (currentChild) {
            Object.assign(currentChild, data);
            if (data.dob) currentChild.age = calculateAge(data.dob);
            saveToLocalStorage();
          }
          if (editModal) editModal.close();
          render();
        });
      }
    }

    // Add Vaccine button & form
    const addVacBtn = document.getElementById('addVacBtn');
    const addVacModal = document.getElementById('addVacModal');
    if (addVacBtn && addVacModal) {
      addVacBtn.addEventListener('click', () => addVacModal.showModal());
    }
    const addVacForm = document.getElementById('addVacForm');
    if (addVacForm) {
      addVacForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        let newId = Date.now();
        try {
          const res = await apiFetch(`children/${encodeURIComponent(r.childId)}/vaccinations`, {
            method: 'POST',
            body: JSON.stringify(data)
          });
          const resData = await res.json();
          if (resData.id) newId = resData.id;
        } catch (err) {
          console.warn('API error when adding vaccine:', err);
        }
        if (currentChild) {
          currentChild.vaccinations = currentChild.vaccinations || [];
          currentChild.vaccinations.push({
            id: newId,
            vaccine: data.vaccine,
            dose: parseInt(data.dose) || 1,
            dateGiven: data.dateGiven || null,
            dueDate: data.dueDate || null,
            status: data.status || 'Given'
          });
          saveToLocalStorage();
        }
        if (addVacModal) addVacModal.close();
        render();
      });
    }

    // Add Checkup button & form
    const addCheckBtn = document.getElementById('addCheckBtn');
    const addCheckModal = document.getElementById('addCheckModal');
    if (addCheckBtn && addCheckModal) {
      addCheckBtn.addEventListener('click', () => addCheckModal.showModal());
    }
    const addCheckForm = document.getElementById('addCheckForm');
    if (addCheckForm) {
      addCheckForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        let newId = Date.now();
        try {
          const res = await apiFetch(`children/${encodeURIComponent(r.childId)}/checkups`, {
            method: 'POST',
            body: JSON.stringify(data)
          });
          const resData = await res.json();
          if (resData.id) newId = resData.id;
        } catch (err) {
          console.warn('API error when adding checkup:', err);
        }
        if (currentChild) {
          currentChild.checkups = currentChild.checkups || [];
          const newCheck = {
            id: newId,
            date: data.date,
            type: data.type || 'Routine',
            doctor: data.doctor || 'Doctor',
            weightKg: data.weightKg ? parseFloat(data.weightKg) : null,
            heightCm: data.heightCm ? parseFloat(data.heightCm) : null,
            bp: data.bp || '110/70',
            temperatureC: data.temperatureC ? parseFloat(data.temperatureC) : null,
            pulse: data.pulse ? parseInt(data.pulse) : null,
            findings: data.findings || 'Normal routine checkup',
            followUp: data.followUp || 'As needed'
          };
          currentChild.checkups.push(newCheck);

          // Also record growth history if weight or height was recorded
          if (newCheck.weightKg || newCheck.heightCm) {
            currentChild.history = currentChild.history || [];
            currentChild.history.unshift({
              id: Date.now(),
              date: data.date,
              weight: newCheck.weightKg || currentChild.weightKg || 0,
              height: newCheck.heightCm || currentChild.heightCm || 0,
              note: `Checkup finding: ${newCheck.findings}`
            });
            if (newCheck.weightKg) currentChild.weightKg = newCheck.weightKg;
            if (newCheck.heightCm) currentChild.heightCm = newCheck.heightCm;
          }
          saveToLocalStorage();
        }
        if (addCheckModal) addCheckModal.close();
        render();
      });
    }

    // Add Growth Record button & form
    const addGrowthBtn = document.getElementById('addGrowthBtn');
    const addGrowthModal = document.getElementById('addGrowthModal');
    if (addGrowthBtn && addGrowthModal) {
      addGrowthBtn.addEventListener('click', () => addGrowthModal.showModal());
    }
    const addGrowthForm = document.getElementById('addGrowthForm');
    if (addGrowthForm) {
      addGrowthForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        let newId = Date.now();
        try {
          const res = await apiFetch(`children/${encodeURIComponent(r.childId)}/growth`, {
            method: 'POST',
            body: JSON.stringify(data)
          });
          const resData = await res.json();
          if (resData.id) newId = resData.id;
        } catch (err) {
          console.warn('API error when adding growth record:', err);
        }
        if (currentChild) {
          currentChild.history = currentChild.history || [];
          const w = parseFloat(data.weight) || 0;
          const h = parseFloat(data.height) || 0;
          currentChild.history.unshift({
            id: newId,
            date: data.date,
            weight: w,
            height: h,
            note: data.note || 'Growth record'
          });
          currentChild.weightKg = w;
          currentChild.heightCm = h;
          saveToLocalStorage();
        }
        if (addGrowthModal) addGrowthModal.close();
        render();
      });
    }

    // Add Medical Report Data button & form
    const addMhdBtn = document.getElementById('addMhdBtn');
    const addMhdModal = document.getElementById('addMhdModal');
    if (addMhdBtn && addMhdModal) {
      addMhdBtn.addEventListener('click', () => addMhdModal.showModal());
    }
    const addMhdForm = document.getElementById('addMhdForm');
    if (addMhdForm) {
      addMhdForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        let newId = Date.now();
        try {
          const res = await apiFetch(`children/${encodeURIComponent(r.childId)}/medical_history`, {
            method: 'POST',
            body: JSON.stringify(data)
          });
          const resData = await res.json();
          if (resData.id) newId = resData.id;
        } catch (err) {
          console.warn('API error when adding medical report:', err);
        }
        if (currentChild) {
          currentChild.medicalData = currentChild.medicalData || [];
          currentChild.medicalData.push({
            id: newId,
            date: data.date,
            type: data.type || 'Prescription',
            description: data.description || '',
            fileUrl: data.fileUrl || ''
          });
          saveToLocalStorage();
        }
        if (addMhdModal) addMhdModal.close();
        render();
      });
    }
  }

  function navigate(path) {
    let hash = path.startsWith('#') ? path : '#' + (path.startsWith('/') ? path : '/' + path);
    if (location.hash !== hash) {
      location.hash = hash;
    } else {
      render();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Intercept hash navigation clicks safely
  document.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#/folder') || href === '#/' || href === '#') {
      event.preventDefault();
      navigate(href);
    }
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('popstate', render);

  async function loadChildren(reRender = true) {
    // 1. Immediately render cached data if available
    const cached = loadFromLocalStorage();
    if (cached && cached.length) {
      allChildren = cached;
      if (reRender) render();
    } else if (window.childrenRecords && window.childrenRecords.length && !allChildren.length) {
      allChildren = [...window.childrenRecords];
      if (reRender) render();
    }

    // 2. Fetch live data from backend API
    try {
      const response = await apiFetch('children');
      if (response.ok) {
        const liveData = await response.json();
        if (Array.isArray(liveData) && liveData.length) {
          // Merge with any offline-added children not yet in database
          const existingIds = new Set(liveData.map(c => String(c.id).toLowerCase()));
          const localOnly = allChildren.filter(c => !existingIds.has(String(c.id).toLowerCase()));
          allChildren = [...liveData, ...localOnly];
          saveToLocalStorage();
          if (reRender) render();
          return;
        }
      }
    } catch (error) {
      console.warn('Backend API connection note:', error.message);
    }

    // Fallback guarantee
    if (!allChildren || !allChildren.length) {
      if (window.childrenRecords && window.childrenRecords.length) {
        allChildren = [...window.childrenRecords];
      }
    }
    if (reRender) render();
  }

  loadChildren();
})();
