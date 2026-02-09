import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import emailjs from "@emailjs/nodejs";
import session from "express-session";
import sharp from "sharp";

import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const galleryDir = path.join(__dirname, "public/uploads/gallery");
const pfpDir = path.join(__dirname, "public/uploads/pfp");

fs.mkdirSync(galleryDir, { recursive: true });
fs.mkdirSync(pfpDir, { recursive: true });

import User from "./models/User.js";
import Profile from "./models/Profile.js";

const app = express();

/* ===================== MIDDLEWARE ===================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        }
    })
);

app.set("view engine", "ejs");

/* ===================== MULTER ===================== */
const pfpStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, pfpDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `pfp-${Date.now()}${ext}`);
    }
});

export const uploadPfp = multer({
    storage: pfpStorage,
    limits: { fileSize: 10 * 1024 * 1024  } // 10MB
});

const galleryStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, galleryDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `img-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
    }
});

export const uploadGallery = multer({
    storage: galleryStorage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});



/* ===================== AUTH GUARDS ===================== */
const requireAuth = (req, res, next) => {
    if (!req.session.userId) return res.redirect("/sign_in");
    next();
};

const requireGuest = (req, res, next) => {
    if (req.session.userId) return res.redirect("/dashboard");
    next();
};

const requireProfile = async (req, res, next) => {
    const user = await User.findById(req.session.userId);
    if (!user) return res.redirect("/sign_in");
    if (!user.Profile_created_status) return res.redirect("/Profile_create");
    next();
};

const requireNoProfile = async (req, res, next) => {
    const user = await User.findById(req.session.userId);
    if (!user) return res.redirect("/sign_in");
    if (user.Profile_created_status) return res.redirect("/dashboard");
    next();
};

/* ===================== DATABASE ===================== */
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch(err => console.error("❌ MongoDB error:", err));

/* ===================== ROUTES ===================== */

/* ---------- SIGN UP ---------- */
app.get("/", requireGuest, (req, res) => {
    res.render("index");
});

app.post("/", requireGuest, async (req, res) => {
    const { name, email, dob, phone, pin } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.redirect("/sign_in");

    await User.create({
        name,
        email,
        dob,
        phone,
        pin,
        Profile_created_status: false
    });

    res.redirect("/sign_in");
});

/* ---------- SIGN IN ---------- */
app.get("/sign_in", requireGuest, (req, res) => {
    res.render("sign_in", { error: null });
});

app.post("/sign_in", requireGuest, async (req, res) => {
    const { email, pin } = req.body;
    const user = await User.findOne({ email });

    if (!user || String(user.pin) !== String(pin)) {
        return res.render("sign_in", { error: "Invalid email or PIN" });
    }

    req.session.userId = user._id;

    if (user.Profile_created_status) return res.redirect("/dashboard");
    res.redirect("/Profile_create");
});

/* ---------- PROFILE CREATE ---------- */
app.get(
    "/Profile_create",
    requireAuth,
    requireNoProfile,
    async (req, res) => {
        const user = await User.findById(req.session.userId).lean();
        res.render("Profile_create", { user });
    }
);
app.post(
    "/create-profile",
    requireAuth,
    requireNoProfile,
    async (req, res) => {
        const { name, gender, bio } = req.body;
        const user = await User.findById(req.session.userId);

        if (!user) return res.redirect("/sign_in");

        await Profile.create({
            user: user._id,              // 🔧 FIX
            name,
            gender,
            bio,
            uploads: [],                 // correct type
            pfp: null
        });

        user.Profile_created_status = true;
        await user.save();

        res.redirect("/dashboard");
    }
);


/* ---------- DASHBOARD ---------- */
app.get(
    "/dashboard",
    requireAuth,
    requireProfile,
    async (req, res) => {
        const user = await User.findById(req.session.userId).lean();
        const profile = await Profile.findOne({ user: user._id }).lean(); // 🔧 FIX

        if (!user || !profile) {
            req.session.destroy();
            return res.redirect("/sign_in");
        }

        delete user.pin;

        res.render("dashboard", {
            user,
            profile,
            images: profile.uploads // 🔧 FIX (no normalization hacks)
        });
    }
);


/* ---------- LOGOUT ---------- */
app.get("/logout", requireAuth, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.redirect("/sign_in");
    });
});

/* ---------- RECOVER PIN ---------- */
app.get("/recover_pin", requireGuest, (req, res) => {
    res.render("Recover_pin", { error: null, success: null });
});

app.post("/recover-pin", requireGuest, async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.render("Recover_pin", {
                success: null,
                error: "No account found"
            });
        }

        await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_TEMPLATE_ID,
            {
                email: user.email,
                pin: String(user.pin),
                name: "UniVerse Team"
            },
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY
            }
        );

        res.render("Recover_pin", {
            success: "PIN sent to your email",
            error: null
        });
    } catch (err) {
        console.error(err);
        res.render("Recover_pin", {
            success: null,
            error: "Failed to send PIN"
        });
    }
});

/* ---------- TERMS ---------- */
app.get("/terms_and_conditions", (req, res) => {
    res.render("terms_and_conditions");
});

/* ---------- PROFILE PIC UPLOAD ---------- */
app.post(
    "/upload-pfp",
    requireAuth,
    requireProfile,
    uploadPfp.single("pfp"),
    async (req, res) => {
        try {
            const user = await User.findById(req.session.userId);
            const profile = await Profile.findOne({ user: req.session.userId });// 🔧 FIX

            if (!req.file) return res.status(400).json({ success: false });

            const filename = `pfp-${user._id}.jpg`;
            const filepath = `public/uploads/pfp/${filename}`;

            await sharp(req.file.path)
                .resize(400, 400)
                .jpeg({ quality: 80 })
                .toFile(filepath);

            profile.pfp = `/uploads/pfp/${filename}`;
            await profile.save();

            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false });
        }
    }
);

/* ---------- GALLERY IMAGE UPLOAD ---------- */
/* ---------- GALLERY IMAGE UPLOAD ---------- */
app.post(
    "/upload/gallery",
    requireAuth,
    requireProfile,
    uploadGallery.single("gallery"),
    async (req, res) => {
        try {
            if (!req.file) {
                console.error("❌ No file received by Multer");
                return res.status(400).send("No file uploaded");
            }

            const profile = await Profile.findOne({
                user: req.session.userId
            });

            if (!profile) {
                console.error("❌ Profile not found");
                return res.status(404).send("Profile not found");
            }

            profile.uploads.push({
                image: `/uploads/gallery/${req.file.filename}`,
                likes: 0,
                likedBy: []
            });

            await profile.save();

            console.log("✅ Gallery image uploaded:", req.file.filename);
            res.redirect("/dashboard");
        } catch (err) {
            console.error("❌ GALLERY UPLOAD ERROR:", err);
            res.status(500).send("Gallery upload failed");
        }
    }
);


/* ---------- LIKE IMAGE ---------- */
app.post(
    "/like-image/:imageId",
    requireAuth,
    requireProfile,
    async (req, res) => {
        try {
            const user = await User.findById(req.session.userId);
            const profile = await Profile.findOne({ email: user.email });

            const image = profile.uploads.id(req.params.imageId);
            if (!image) return res.status(404).json({ error: "Image not found" });

            const alreadyLiked = image.likedBy.includes(user._id);

            if (alreadyLiked) {
                // Unlike
                image.likes = Math.max(0, image.likes - 1);
                image.likedBy = image.likedBy.filter(id => id.toString() !== user._id.toString());
            } else {
                // Like
                image.likes++;
                image.likedBy.push(user._id);
            }

            await profile.save();

            res.json({
                likes: image.likes,
                liked: !alreadyLiked
            });
        } catch (err) {
            console.error("LIKE ERROR:", err);
            res.status(500).json({ error: err.message });
        }
    }
);

/* ---------- DELETE IMAGE ---------- */
app.delete(
    "/delete-image/:imageId",
    requireAuth,
    requireProfile,
    async (req, res) => {
        try {
            const user = await User.findById(req.session.userId);
            const profile = await Profile.findOne({ email: user.email });

            const image = profile.uploads.id(req.params.imageId);
            if (!image) return res.sendStatus(404);

            const filePath = path.join("public", image.image);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

            image.deleteOne();
            await profile.save();

            res.sendStatus(200);
        } catch (err) {
            console.error("DELETE ERROR:", err);
            res.status(500).json({ error: err.message });
        }
    }
);

/* ===================== SERVER ===================== */
app.listen(3000, () => {
    console.log("🚀 Server running on http://localhost:3000");
});