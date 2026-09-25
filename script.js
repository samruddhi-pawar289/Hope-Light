window.addEventListener("load", function () {

    const analyticsText = document.getElementById("analytics_textinfo");

    analyticsText.classList.add("reveal");

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