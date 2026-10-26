// =============================analytics text=======================
window.addEventListener("load", function () {
    const analyticsText = document.getElementById("analytics_textinfo");
    if (analyticsText) {
        analyticsText.classList.add("reveal");
    }
});

const rotatingImages = Array.from(document.querySelectorAll(".rotator-image"));
const imageBackdrop = document.querySelector(".rotator-backdrop");

if (rotatingImages.length && imageBackdrop) {
    let currentImage = 0;
    imageBackdrop.style.backgroundImage = `url("${rotatingImages[currentImage].src}")`;

    window.setInterval(() => {
        rotatingImages[currentImage].classList.remove("active");
        currentImage = (currentImage + 1) % rotatingImages.length;
        rotatingImages[currentImage].classList.add("active");
        imageBackdrop.style.backgroundImage = `url("${rotatingImages[currentImage].src}")`;
    }, 4000);
}

const statCards = document.querySelectorAll(".stat-card");

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

let activeApiBase = null;

async function fetchSummary() {
    const candidates = activeApiBase ? [activeApiBase, ...getCandidateApis()] : getCandidateApis();
    
    for (const base of candidates) {
        try {
            const cleanBase = base.replace(/\/+$/, '');
            const res = await fetch(`${cleanBase}/summary`, { method: 'GET' });
            if (res.ok) {
                const data = await res.json();
                activeApiBase = cleanBase;
                window.HOPE_LIGHT_API = cleanBase;
                return data;
            }
        } catch {
            // Try next candidate
        }
    }
    
    // Fallback: calculate from localStorage or window.childrenRecords
    let cached = [];
    try {
        const stored = localStorage.getItem('hope_light_children');
        if (stored) cached = JSON.parse(stored);
    } catch {
        cached = [];
    }
    if (!cached.length && window.childrenRecords) {
        cached = window.childrenRecords;
    }
    
    if (cached.length) {
        const totalChildren = cached.length;
        const totalMed = cached.reduce((sum, c) => sum + (c.history || []).length + (c.medicalData || []).length, 0);
        const totalVac = cached.filter(c => (c.vaccinations || []).some(v => v.status === 'Given')).length;
        const totalChk = cached.reduce((sum, c) => sum + (c.checkups || []).length, 0);
        return {
            children: totalChildren,
            medicalReports: totalMed,
            vaccinatedChildren: totalVac,
            checkups: totalChk
        };
    }
    return null;
}

function updateCounters(summary) {
    if (!summary) return;
    const values = {
        populationcounter: summary.children,
        medicalcounter: summary.medicalReports,
        vaccinecounter: summary.vaccinatedChildren,
        checkupcounter: summary.checkups
    };
    Object.entries(values).forEach(([id, value]) => {
        const number = document.querySelector(`#${id} .card-number`);
        if (number && value !== undefined && value !== null) {
            number.textContent = value;
        }
    });
}

// Initial fetch on load
fetchSummary().then(updateCounters).catch(() => {});

statCards.forEach(card => {
    card.addEventListener("mouseenter", () => {
        statCards.forEach(otherCard => {
            if (otherCard !== card) otherCard.classList.add("blurred");
        });
    });

    card.addEventListener("mouseleave", () => {
        statCards.forEach(otherCard => otherCard.classList.remove("blurred"));
    });
});

const headers = document.querySelectorAll(
    ".analytics_header, .catalog_header, .about_header"
);

headers.forEach(header => {
    header.addEventListener("click", function () {
        headers.forEach(item => {
            item.classList.remove("selected");
        });
        this.classList.add("selected");
    });
});

// Sync analytics counter cards when data is manipulated
async function syncCounters() {
    try {
        const summary = await fetchSummary();
        if (summary) updateCounters(summary);
    } catch (e) {
        // Silently preserve state
    }
}

window.addEventListener("storage", (e) => {
    if (e.key === "hope_light_data_updated" || e.key === "hope_light_children") {
        syncCounters();
    }
});
window.addEventListener("hope_light:data_manipulated", syncCounters);
window.addEventListener("focus", syncCounters);

