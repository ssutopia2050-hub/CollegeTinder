import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import emailjs from "@emailjs/nodejs";
import session from "express-session";

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
        cookie: { maxAge: 1000 * 60 * 60 * 24 }
    })
);

app.set("view engine", "ejs");

/* ===================== AUTH GUARDS ===================== */

// must be logged in
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect("/sign_in");
    }
    next();
};

// must NOT be logged in
const requireGuest = (req, res, next) => {
    if (req.session.userId) {
        return res.redirect("/dashboard");
    }
    next();
};

// must have profile completed
const requireProfile = async (req, res, next) => {
    const user = await User.findById(req.session.userId);
    if (!user.Profile_created_status) {
        return res.redirect("/Profile_create");
    }
    next();
};

// must NOT have profile completed
const requireNoProfile = async (req, res, next) => {
    const user = await User.findById(req.session.userId);
    if (user.Profile_created_status) {
        return res.redirect("/dashboard");
    }
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
        return res.render("sign_in", {
            error: "Invalid email or PIN"
        });
    }

    req.session.userId = user._id;

    if (user.Profile_created_status) {
        return res.redirect("/dashboard");
    }

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

        if (!user) return res.sendStatus(401);

        await Profile.create({
            email: user.email,
            name,
            gender,
            bio
        });

        user.Profile_created_status = true;
        await user.save();

        // ✅ SERVER controls next step
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
        const profile = await Profile.findOne({ email: user.email }).lean();

        delete user.pin;

        res.render("dashboard", { user, profile });
    }
);

/* ---------- LOG OUT ---------- */
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/sign_in");
    });
});

/* ---------- RECOVER PIN ---------- */
app.get("/recover_pin", requireGuest, (req, res) => {
    res.render("recover_pin", { error: null, success: null });
});

app.post("/recover-pin", requireGuest, async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
        return res.render("recover_pin", {
            error: "No account found",
            success: null
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

    res.render("recover_pin", {
        success: "PIN sent to your email",
        error: null
    });
});

/* ===================== SERVER ===================== */
app.listen(3000, () => {
    console.log("🚀 Server running on http://localhost:3000");
});
