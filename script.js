document.querySelectorAll(".cell").forEach(cell => {
    cell.addEventListener("click", () => {
        let name = prompt("輸入課名：");
        if (name) {
            cell.textContent = name;
        }
    });
});


document.getElementById("saveBtn").onclick = () => {
    let data = "day,period,course\n";

    document.querySelectorAll(".cell").forEach(c => {
        if (c.textContent.trim() !== "") {
            data += `${c.dataset.day},${c.dataset.period},${c.textContent.trim()}\n`;
        }
    });

    let blob = new Blob([data], { type: "text/csv" });
    let url = window.URL.createObjectURL(blob);

    let a = document.createElement("a");
    a.href = url;
    a.download = "courses.csv";
    a.click();
};
