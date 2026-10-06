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

fetch(`${window.HOPE_LIGHT_API || "http://127.0.0.1:5000"}/api/summary`)
    .then(response => {
        if (!response.ok) throw new Error("Analytics are unavailable");
        return response.json();
    })
    .then(summary => {
        const values = {
            populationcounter: summary.children,
            medicalcounter: summary.medicalReports,
            vaccinecounter: summary.vaccinatedChildren,
            checkupcounter: summary.checkups
        };
        Object.entries(values).forEach(([id, value]) => {
            const number = document.querySelector(`#${id} .card-number`);
            if (number) number.textContent = value;
        });
    })
    .catch(() => {});

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
// ================================nav bar bg coloure================================
headers.forEach(header => {
    header.addEventListener("click", function () {

        headers.forEach(item => {
            item.classList.remove("selected");
        });

        this.classList.add("selected");
    });
});
// =====================================bg responsive emoji===========================================

window.setInterval(async () => {
    try {
        const response = await fetch(`${window.HOPE_LIGHT_API || "http://127.0.0.1:5000"}/api/summary`);
        if (response.ok) {
            const data = await response.json();
            const pop = document.querySelector('#populationcounter .card-number');
            if (pop) pop.textContent = data.children;
            
            const med = document.querySelector('#medicalcounter .card-number');
            if (med) med.textContent = data.medicalReports;
            
            const vac = document.querySelector('#vaccinecounter .card-number');
            if (vac) vac.textContent = data.vaccinatedChildren;
            
            const chk = document.querySelector('#checkupcounter .card-number');
            if (chk) chk.textContent = data.checkups;
        }
    } catch (e) {
        console.error("Polling failed", e);
    }
}, 5000);
