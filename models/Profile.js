import mongoose from "mongoose";

const profileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },

    bio: {
        type: String,
        default: "",
    },

    gender: {
        type: String,
        default: "",
    },

    pfp: {
        type: String,
        default: "/default-pfp.png",
    },

    uploads: [
        {
            image: { type: String, required: true },
            likes: { type: Number, default: 0 },
            likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
        }
    ]

});

export default mongoose.model("Profile", profileSchema);
