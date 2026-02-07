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
        cookie: {
            httpOnly: true,
            maxAge: 10 * 1000 // 10 seconds
        }
    })
);

app.set("view engine", "ejs");

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

        await Profile.findOneAndUpdate(
            { email: user.email },
            { email: user.email, name, gender, bio },
            { upsert: true }
        );

        user.Profile_created_status = true;
        await user.save();

        res.redirect("/dashboard");
    }
);

/* ---------- DASHBOARD ---------- */


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
        console.log("[Recover PIN] Requested for email:", email);

        // Check that all required environment variables exist
        const missingVars = [];
        ["EMAILJS_SERVICE_ID", "EMAILJS_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY"].forEach(key => {
            if (!process.env[key]) missingVars.push(key);
        });
        if (missingVars.length) {
            console.error("[Recover PIN] Missing env variables:", missingVars);
            return res.render("Recover_pin", { // case-sensitive match to your file
                success: null,
                error: `Server misconfigured. Missing: ${missingVars.join(", ")}`
            });
        }

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            console.log("[Recover PIN] No user found for email:", email);
            return res.render("Recover_pin", {
                success: null,
                error: "No account found"
            });
        }

        // Send email with BOTH keys (strict mode)
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

        console.log("[Recover PIN] Email sent successfully to:", email);

        res.render("Recover_pin", {
            success: "PIN sent to your email",
            error: null
        });

    } catch (err) {
        console.error("[Recover PIN] Error:", err);
        res.render("Recover_pin", {
            success: null,
            error: "Failed to send PIN. Check Render logs for details."
        });
    }
});

app.get(
    "/dashboard",
    requireAuth,
    requireProfile,
    async (req, res) => {
        const user = await User.findById(req.session.userId).lean();
        const profile = await Profile.findOne({ email: user.email }).lean();

        if (!user) {
            req.session.destroy();
            return res.redirect("/sign_in");
        }

        delete user.pin;

        res.render("dashboard", {
            user,
            profile: profile || null   // ✅ THIS LINE FIXES EVERYTHING
        });
    }
);



app.get("/terms_and_conditions", (req, res) => {
    res.render("terms_and_conditions")
})
/* ===================== SERVER ===================== */
app.listen(3000, () => {
    console.log("🚀 Server running on http://localhost:3000");
});
