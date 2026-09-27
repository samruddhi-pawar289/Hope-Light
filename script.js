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
