document.addEventListener("DOMContentLoaded", () => {

    const uploadOverlay = document.getElementById("uploadOverlay");
    const pfpOverlay = document.getElementById("pfpOverlay");
    const imageViewOverlay = document.getElementById("imageViewOverlay");
    const viewImage = document.getElementById("viewImage");
    const likeBtn = document.querySelector(".like-btn");
    const deleteBtn = document.querySelector(".delete-btn");

    let currentImageId = null;

    /* ================= OPEN OVERLAYS ================= */

    const uploadTrigger = document.querySelector(".upload-trigger");
    if (uploadTrigger) {
        uploadTrigger.onclick = () => uploadOverlay.style.display = "flex";
    }

    const pfpImg = document.querySelector(".profile-picture-container img");
    if (pfpImg) {
        pfpImg.onclick = () => pfpOverlay.style.display = "flex";
    }

    document.querySelectorAll(".overlay").forEach(overlay => {
        overlay.addEventListener("click", e => {
            if (e.target === overlay) overlay.style.display = "none";
        });
    });

    /* ================= DROP ZONES ================= */

    document.querySelectorAll(".drop-zone").forEach(zone => {
        const input = document.getElementById(zone.dataset.input);
        const form = zone.closest("form");

        zone.addEventListener("click", () => input.click());

        input.addEventListener("change", () => {
            if (input.files.length) uploadFile(form);
        });
    });

    /* ================= UPLOAD ================= */

    async function uploadFile(form) {
        const formData = new FormData(form);

        try {
            const res = await fetch(form.action, {
                method: "POST",
                body: formData,
                redirect: "follow" // 🔧 IMPORTANT
            });

            // 🔧 FIX: if server redirected, upload SUCCESS
            if (res.redirected) {
                window.location.href = res.url;
                return;
            }

            const text = await res.text();
            let data = {};
            try { data = JSON.parse(text); } catch {}

            if (!res.ok || !data.success) {
                console.error("UPLOAD ERROR:", text);
                alert("Upload failed. Check server logs.");
                return;
            }

            window.location.reload();

        } catch (err) {
            console.error(err);
            alert("Upload failed.");
        }
    }

    /* ================= IMAGE VIEW ================= */

    document
        .querySelectorAll(".uploaded-image-container:not(.upload-trigger)")
        .forEach(card => {
            card.addEventListener("click", () => {
                currentImageId = card.dataset.id;
                viewImage.src = card.querySelector("img").src;

                const liked = card.dataset.liked === "true";
                likeBtn.classList.toggle("liked", liked);
                likeBtn.querySelector("i").className =
                    liked ? "fa-solid fa-heart" : "fa-regular fa-heart";

                imageViewOverlay.style.display = "flex";
            });
        });

    window.closeImageView = () => {
        imageViewOverlay.style.display = "none";
        currentImageId = null;
    };

    /* ================= LIKE ================= */

    if (likeBtn) {
        likeBtn.addEventListener("click", async () => {
            if (!currentImageId) return;

            const res = await fetch(`/like-image/${currentImageId}`, {
                method: "POST"
            });

            if (!res.ok) return;

            const data = await res.json();

            likeBtn.classList.toggle("liked", data.liked);
            likeBtn.querySelector("i").className =
                data.liked ? "fa-solid fa-heart" : "fa-regular fa-heart";

            const card = document.querySelector(`[data-id="${currentImageId}"]`);
            if (card) card.dataset.liked = data.liked;
        });
    }

    /* ================= DELETE ================= */

    if (deleteBtn) {
        deleteBtn.addEventListener("click", async () => {
            if (!currentImageId) return;
            if (!confirm("Delete this image?")) return;

            const res = await fetch(`/delete-image/${currentImageId}`, {
                method: "DELETE"
            });

            if (res.ok) {
                const card = document.querySelector(`[data-id="${currentImageId}"]`);
                if (card) card.remove();
                closeImageView();
            }
        });
    }


});
