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
        saveUninitialized: true, // Changed to true to store temp signup data
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

/* ===================== HELPER FUNCTIONS ===================== */
function generateRandom4DigitNumber() {
    return Math.floor(Math.random() * 9000) + 1000;
}

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
    try {
        const { name, email, dob, phone, pin } = req.body;

        // Check if user already exists
        const exists = await User.findOne({ email });
        if (exists) {
            return res.render("index", {
                error: "Email already registered. Please sign in."
            });
        }

        // Generate OTP
        const otp_generated = generateRandom4DigitNumber();

        // Store signup data in session (NOT in database yet)
        req.session.pendingSignup = {
            name,
            email,
            dob,
            phone,
            pin,
            otp: otp_generated,
            otpExpiry: Date.now() + 10 * 60 * 1000 // 10 minutes
        };

        // Send OTP email
        await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_VERIF_TEMPLATE_ID,
            {
                email: email, // Fixed: was using undefined 'user.email'
                otp: otp_generated,
                name: name
            },
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY
            }
        );

        console.log(`✅ OTP sent to ${email}: ${otp_generated}`); // For testing only - remove in production

        res.redirect("/verify_email");
    } catch (err) {
        console.error("❌ Signup error:", err);
        res.render("index", {
            error: "Failed to send verification email. Please try again."
        });
    }
});

/* ---------- Email Verify ---------- */
app.get("/verify_email", (req, res) => {
    // Check if there's pending signup data
    if (!req.session.pendingSignup) {
        return res.redirect("/");
    }

    res.render("email_verify_page", {
        error: null,
        email: req.session.pendingSignup.email
    });
});

app.post("/verify_email", async (req, res) => {
    try {
        const { otp } = req.body;

        // Check if there's pending signup
        if (!req.session.pendingSignup) {
            return res.render("email_verify_page", {
                error: "Session expired. Please sign up again.",
                email: null
            });
        }

        const { otp: storedOtp, otpExpiry, name, email, dob, phone, pin } = req.session.pendingSignup;

        // Check if OTP expired
        if (Date.now() > otpExpiry) {
            delete req.session.pendingSignup;
            return res.render("email_verify_page", {
                error: "OTP expired. Please sign up again.",
                email: email
            });
        }

        // Verify OTP (convert both to strings for comparison)
        if (String(otp) !== String(storedOtp)) {
            return res.render("email_verify_page", {
                error: "Invalid OTP. Please try again.",
                email: email
            });
        }

        // OTP is correct - Create the user account
        await User.create({
            name,
            email,
            dob,
            phone,
            pin,
            Profile_created_status: false,
            email_verified: true // Mark as verified
        });

        // Clear pending signup data
        delete req.session.pendingSignup;

        console.log(`✅ User verified and created: ${email}`);

        res.redirect("/sign_in");
    } catch (err) {
        console.error("❌ Verification error:", err);
        res.render("email_verify_page", {
            error: "Verification failed. Please try again.",
            email: req.session.pendingSignup?.email || null
        });
    }
});

/* ---------- RESEND OTP ---------- */
app.post("/resend-otp", async (req, res) => {
    try {
        // Check if there's pending signup
        if (!req.session.pendingSignup) {
            return res.status(400).json({
                success: false,
                message: "No pending verification found"
            });
        }

        const { email, name } = req.session.pendingSignup;

        // Generate new OTP
        const newOtp = generateRandom4DigitNumber();

        // Update session with new OTP and expiry
        req.session.pendingSignup.otp = newOtp;
        req.session.pendingSignup.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

        // Send new OTP email
        await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_VERIF_TEMPLATE_ID,
            {
                email: email,
                otp: newOtp,
                name: name
            },
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY
            }
        );

        console.log(`✅ New OTP sent to ${email}: ${newOtp}`);

        res.json({
            success: true,
            message: "New OTP sent successfully"
        });
    } catch (err) {
        console.error("❌ Resend OTP error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to resend OTP"
        });
    }
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

    // Check if email is verified
    if (!user.email_verified) {
        return res.render("sign_in", {
            error: "Email not verified. Please complete verification first."
        });
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
            user: user._id,
            name,
            gender,
            bio,
            uploads: [],
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
        const profile = await Profile.findOne({ user: user._id }).lean();

        if (!user || !profile) {
            req.session.destroy();
            return res.redirect("/sign_in");
        }

        delete user.pin;

        res.render("dashboard", {
            user,
            profile,
            images: profile.uploads
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
            const profile = await Profile.findOne({ user: req.session.userId });

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
            const profile = await Profile.findOne({ user: user._id }); // Fixed: was using email

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
            const profile = await Profile.findOne({ user: user._id }); // Fixed: was using email

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