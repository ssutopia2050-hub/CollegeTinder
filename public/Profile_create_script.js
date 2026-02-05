let currentStep = 1;
const totalSteps = document.querySelectorAll(".card").length;

const data = {
    name: "",
    gender: "",
    bio: ""
};

function nextStep() {
    const current = document.querySelector(`.card[data-step="${currentStep}"]`);
    if (!current) return;

    current.classList.remove("active");
    current.classList.add("exit");

    currentStep++;

    const nextCard = document.querySelector(`.card[data-step="${currentStep}"]`);
    if (nextCard) {
        nextCard.classList.add("active");
        updateProgress();
    } else {
        submitProfile();
    }
}

function selectGender(button, value) {
    data.gender = value;

    // visual selection
    document.querySelectorAll(".choice-group button").forEach(btn =>
        btn.classList.remove("selected")
    );
    button.classList.add("selected");

    setTimeout(nextStep, 300);
}

function submitProfile() {
    data.name = document.getElementById("name")?.value || "";
    data.bio = document.getElementById("bio")?.value || "";

    fetch("/create-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }).then(() => {
        window.location.href = "/dashboard";
    });
}

function updateProgress() {
    const progress = document.getElementById("progressBar");
    const percent = ((currentStep - 1) / totalSteps) * 100;
    progress.style.width = percent + "%";
}
