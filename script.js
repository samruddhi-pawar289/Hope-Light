// =============================analytics text=======================
window.addEventListener("load", function () {

    const analyticsText = document.getElementById("analytics_textinfo");

    if (analyticsText) {
        analyticsText.classList.add("reveal");
    }

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
// 1. Choose your own emojis per card here
const cardEmojis = {
    populationcounter: ["👶", "🧒", "🧸"],
    medicalcounter: ["📋", "🏥", "📝"],
    vaccinecounter: ["💉", "🩹", "🧪"],
    checkupcounter: ["🩺", "❤️", "🔬"]
};

const EMOJIS_PER_SIDE = 6; // how many emojis fly in from each side

Object.keys(cardEmojis).forEach(cardId => {
    const card = document.getElementById(cardId);
    if (!card) return;

    let activeEmojis = [];

    card.addEventListener("mouseenter", () => {
        const emojiList = cardEmojis[cardId];

        // Spawn from LEFT side
        for (let i = 0; i < EMOJIS_PER_SIDE; i++) {
            spawnEmoji(emojiList, "from-left");
        }

        // Spawn from RIGHT side (at the same time)
        for (let i = 0; i < EMOJIS_PER_SIDE; i++) {
            spawnEmoji(emojiList, "from-right");
        }
    });

    card.addEventListener("mouseleave", () => {
        activeEmojis.forEach(el => {
            el.classList.remove("show");
            setTimeout(() => el.remove(), 500); // wait for fade-out transition
        });
        activeEmojis = [];
    });

    function spawnEmoji(emojiList, sideClass) {
        const el = document.createElement("div");
        el.className = `floating-emoji ${sideClass}`;
        el.textContent = emojiList[Math.floor(Math.random() * emojiList.length)];

        // Random vertical position across the screen
        const randomTop = Math.random() * 80 + 5; // 5% to 85% of screen height
        el.style.top = `${randomTop}vh`;

        // Random landing X position (how far it travels inward)
        const randomLanding = Math.random() * 30 + 10; // 10% to 40% from that edge
        document.body.appendChild(el);
        activeEmojis.push(el);

        // Trigger animation on next frame
        requestAnimationFrame(() => {
            el.classList.add("show");
            if (sideClass === "from-left") {
                el.style.transform = `translateX(${randomLanding}vw)`;
            } else {
                el.style.transform = `translateX(-${randomLanding}vw)`;
            }
        });
    }
});