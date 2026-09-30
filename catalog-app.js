(() => {
  const children = window.childrenRecords || [];
  const app = document.getElementById('catalog-app');
  const folderInfo = {
    medical: { title:'Medical Records', description:'Health profiles, growth and care notes', icon:'✚' },
    vaccination: { title:'Vaccination Records', description:'Immunizations and upcoming doses', icon: '✚'},
    checkups: { title:'Previous Checkups', description:'Past visits, vitals and doctor notes', icon:'▤' }
  };
  const esc = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => value ? new Intl.DateTimeFormat('en',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value+'T00:00:00')) : '—';
  const initials = name => name.split(' ').map(part=>part[0]).slice(0,2).join('').toUpperCase();
  const pill = (label, color='') => `<span class="status-pill ${color}">${esc(label)}</span>`;
  const sortedCheckups = child => [...child.checkups].sort((a,b)=>b.date.localeCompare(a.date));
  function healthStatus(child) { return child.status; }
  function vaccineSummary(child) {
    const done=child.vaccinations.filter(v=>v.status==='Given').length;
    const total=child.vaccinations.length;
    const overdue=child.vaccinations.some(v=>v.status==='Overdue');
    const due=child.vaccinations.some(v=>v.status==='Due');
    return {done,total,status:overdue?'Overdue':due?'Due soon':'Up to date',color:overdue?'red':due?'blue':''};
  }
  function recordsCount(folder) { return children.reduce((n,c)=>n+(folder==='medical'?c.history.length:folder==='vaccination'?c.vaccinations.length:c.checkups.length),0); }
  function route() {
    const path=location.pathname.replace(/\/$/,'') || '/';
    const match=path.match(/\/folder\/(medical|vaccination|checkups)(?:\/([^/]+))?/);
    if(!match) return {page:'folders'};
    return {page:match[2]?'detail':'table',folder:match[1],childId:match[2]};
  }
  function crumbs(folder, child) {
    return `<nav class="catalog-crumbs" aria-label="Breadcrumb"><a href="/">← Back to Folders</a><span>/</span><a href="/folder/${folder}">${esc(folderInfo[folder].title)}</a>${child?`<span>/</span><span class="current">${esc(child.name)}</span>`:''}</nav>`;
  }
  function foldersPage() {
    return `<section class="folder-grid">${Object.entries(folderInfo).map(([id,info])=>`<a class="folder-card folder-${id}" href="/folder/${id}"><span class="folder-icon" aria-hidden="true">${info.icon}</span><h2>${esc(info.title)}</h2><p>${esc(info.description)}</p><span class="record-badge">${recordsCount(id)} records</span></a>`).join('')}</section>`;
  }
  function tablePage(folder) {
    let headers, rows;
    if(folder==='medical') {
      headers=['NAME','AGE','WEIGHT','HEIGHT','WARD','STATUS'];
      rows=children.map(c=>[c.name,`${c.age} yrs`,`${c.weightKg} kg`,`${c.heightCm} cm`,c.ward,pill(healthStatus(c),c.status==='Under Treatment'?'orange':c.status==='Monitoring'?'blue':c.status==='Critical'?'red':'')]);
    } else if(folder==='vaccination') {
      headers=['NAME','AGE','VACCINES DONE','LAST VACCINE','NEXT DUE','WARD','STATUS'];
      rows=children.map(c=>{const v=vaccineSummary(c),last=c.vaccinations.filter(x=>x.status==='Given'&&x.dateGiven).sort((a,b)=>b.dateGiven.localeCompare(a.dateGiven))[0],next=c.vaccinations.filter(x=>x.status!=='Given').sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||''))[0];return[c.name,`${c.age} yrs`,`${v.done} / ${v.total}`,date(last?.dateGiven),date(next?.dueDate),c.ward,pill(v.status,v.color)];});
    } else {
      headers=['NAME','AGE','LAST CHECKUP','TYPE','DOCTOR','NEXT CHECKUP','STATUS'];
      rows=children.map(c=>{const latest=sortedCheckups(c)[0];const next=c.checkups.map(x=>x.followUp.match(/(\w{3}) (\d{4})/)).find(Boolean);const status=c.status;return[c.name,`${c.age} yrs`,date(latest?.date),latest?.type||'—',latest?.doctor||'—',next?`${next[1]} ${next[2]}`:'—',pill(status,status==='Under Treatment'?'orange':status==='Monitoring'?'blue':status==='Critical'?'red':'')];});
    }
    return `${crumbs(folder)}<section class="catalog-panel"><div class="panel-heading"><div><span class="mono-label">CHILD RECORDS</span><h2>${esc(folderInfo[folder].title)}</h2><p>${esc(folderInfo[folder].description)}</p></div><span class="records-count">${children.length} children</span></div>${children.length?`<div class="table-wrap"><table class="catalog-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${children.map((c,i)=>`<tr data-href="/folder/${folder}/${c.id}">${rows[i].map((v,j)=>`<td class="${j===0?'child-name':''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:`<div class="empty-state">No records are available in this folder yet.</div>`}</section>`;
  }
  function profile(child) {
    return `<aside class="profile-card"><div class="profile-avatar">${initials(child.name)}</div><div><h2>${esc(child.name)}</h2><div class="profile-status">${pill(child.status,child.status==='Under Treatment'?'orange':child.status==='Monitoring'?'blue':child.status==='Critical'?'red':'')}</div></div><dl class="profile-meta"><div><dt>DATE OF BIRTH</dt><dd>${date(child.dob)}</dd></div><div><dt>AGE</dt><dd>${child.age} years</dd></div><div><dt>BLOOD TYPE</dt><dd>${esc(child.bloodType)}</dd></div><div><dt>WARD</dt><dd>${esc(child.ward)}</dd></div><div><dt>ADMITTED</dt><dd>${date(child.admitted)}</dd></div></dl></aside>`;
  }
  function vaccinationPanel(child) {
    const done=child.vaccinations.filter(v=>v.status==='Given').length;
    const filter=`<div class="filter-tabs" role="group" aria-label="Filter vaccinations"><button class="active" data-filter="All">All</button><button data-filter="Given">Given</button><button data-filter="Upcoming">Upcoming</button></div>`;
    const items=child.vaccinations.map(v=>`<tr data-vaccine-status="${v.status==='Given'?'Given':'Upcoming'}"><td>${esc(v.vaccine)}</td><td>${esc(v.dose)}</td><td>${date(v.dateGiven)}</td><td>${date(v.dueDate)}</td><td>${pill(v.status,v.status==='Overdue'?'red':v.status==='Due'?'blue':'')}</td></tr>`).join('');
    return `<section class="catalog-panel detail-panel"><div class="panel-heading"><div><span class="mono-label">VACCINATION RECORDS</span><h2>Immunization Schedule</h2><p class="panel-subtitle">Doses given and upcoming</p></div></div><div class="progress-copy"><span>${done} of ${child.vaccinations.length} vaccines completed</span><strong>${Math.round(done/child.vaccinations.length*100)}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${done/child.vaccinations.length*100}%"></div></div>${filter}${child.vaccinations.length?`<div class="table-wrap"><table class="catalog-table"><thead><tr><th>VACCINE</th><th>DOSE</th><th>DATE GIVEN</th><th>DUE DATE</th><th>STATUS</th></tr></thead><tbody>${items}</tbody></table></div>`:`<div class="empty-state">No vaccination records are available yet.</div>`}</section>`;
  }
  function checkupPanel(child) {
    const list=sortedCheckups(child),years=['All',...Array.from(new Set(list.map(x=>x.date.slice(0,4))))];
    const newest=list[0],next=newest?.followUp||'—';
    const filters=`<div class="filter-tabs" role="group" aria-label="Filter checkups">${years.map((y,i)=>`<button class="${i===0?'active':''}" data-filter="${y}">${y}</button>`).join('')}</div>`;
    const entries=list.map((v,i)=>`<article class="timeline-item" data-year="${v.date.slice(0,4)}"><details ${i===0?'open':''}><summary><strong>${esc(v.type)} <span>· ${date(v.date)}</span></strong><span>${esc(v.doctor)}</span></summary><div class="timeline-body"><p class="timeline-doctor">${esc(v.doctor)}</p><div class="vitals-grid"><div class="vital"><span>WEIGHT</span><strong>${v.weightKg} kg</strong></div><div class="vital"><span>HEIGHT</span><strong>${v.heightCm} cm</strong></div><div class="vital"><span>BP</span><strong>${esc(v.bp)}</strong></div><div class="vital"><span>TEMP</span><strong>${v.temperatureC}°C</strong></div><div class="vital"><span>PULSE</span><strong>${v.pulse} bpm</strong></div></div><p class="finding">${esc(v.findings)}</p><p class="follow-up"><strong>Follow-up:</strong> ${esc(v.followUp)}</p></div></details></article>`).join('');
    return `<section class="catalog-panel detail-panel"><div class="panel-heading"><div><span class="mono-label">VISIT HISTORY</span><h2>Checkup History</h2><p class="panel-subtitle">Previous visits, newest first</p></div></div><div class="summary-strip"><div class="summary-item"><span>TOTAL CHECKUPS</span><strong>${list.length}</strong></div><div class="summary-item"><span>LAST VISIT</span><strong>${date(newest?.date)}</strong></div><div class="summary-item"><span>NEXT FOLLOW-UP</span><strong>${esc(next)}</strong></div></div>${filters}${list.length?`<div class="timeline">${entries}</div>`:`<div class="empty-state">No checkup records are available yet.</div>`}</section>`;
  }
  function medicalPanel(child) {
    const points=[...child.history].sort((a,b)=>a.date.localeCompare(b.date));
    const width=700,height=220,pad=34;
    const series=(key,color)=>{
      const vals=points.map(p=>p[key]),min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
      const xy=vals.map((v,i)=>({x:pad+i*(width-2*pad)/Math.max(1,vals.length-1),y:height-pad-(v-min+range*.12)/(range*1.24)*(height-2*pad)}));
      return `<polyline points="${xy.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${xy.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}"/>`).join('')}`;
    };
    const history=points.slice().reverse().map(h=>`<div class="summary-item"><span>${date(h.date)}</span><strong>${h.weight} kg · ${h.height} cm</strong><p class="finding">${esc(h.note)}</p></div>`).join('');
    return `<section class="catalog-panel detail-panel"><div class="panel-heading"><div><span class="mono-label">GROWTH &amp; NOTES</span><h2>Growth History</h2><p class="panel-subtitle">Weight and height measurements over time</p></div></div><div class="chart-legend"><span><i class="weight-dot"></i>Weight (kg)</span><span><i class="height-dot"></i>Height (cm)</span></div><div class="growth-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Weight and height trend"><line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" stroke="#ddd9d1"/>${series('weight','#0f684a')}${series('height','#147463')}${points.map((p,i)=>`<text x="${pad+i*(width-2*pad)/Math.max(1,points.length-1)}" y="${height-8}" text-anchor="middle">${date(p.date).split(' ').slice(0,2).join(' ')}</text>`).join('')}</svg></div><div class="summary-strip">${history}</div></section>`;
  }
  function detailPage(folder, id) {
    const child=children.find(c=>c.id===id);
    if(!child) return `${crumbs(folder)}<div class="empty-state">This child record could not be found.</div>`;
    const panel=folder==='vaccination'?vaccinationPanel(child):folder==='checkups'?checkupPanel(child):medicalPanel(child);
    return `${crumbs(folder,child)}<div class="detail-layout">${profile(child)}${panel}</div>`;
  }
  function render() {
    const r=route();
    app.innerHTML=r.page==='folders'?foldersPage():r.page==='table'?tablePage(r.folder):detailPage(r.folder,r.childId);
    app.querySelectorAll('[data-href]').forEach(row=>row.addEventListener('click',()=>navigate(row.dataset.href)));
    app.querySelectorAll('.filter-tabs button').forEach(button=>button.addEventListener('click',()=>{
      const group=button.parentElement;group.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));
      const panel=button.closest('.detail-panel');
      if(panel.querySelector('[data-vaccine-status]')) panel.querySelectorAll('[data-vaccine-status]').forEach(row=>row.hidden=button.dataset.filter!=='All'&&row.dataset.vaccineStatus!==button.dataset.filter);
      if(panel.querySelector('.timeline-item')) panel.querySelectorAll('.timeline-item').forEach(item=>item.hidden=button.dataset.filter!=='All'&&item.dataset.year!==button.dataset.filter);
    }));
  }
  function navigate(path) { history.pushState({},'',path);render();window.scrollTo(0,0); }
  document.addEventListener('click',event=>{const link=event.target.closest('a[href^="/folder"],a[href="/"]');if(!link)return;event.preventDefault();navigate(link.getAttribute('href'));});
  window.addEventListener('popstate',render);
  render();
})();
