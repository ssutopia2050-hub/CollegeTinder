import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    pin: String,
    dob: String,
    // resetOTP: String,
    // otpExpires: Date,
    // lastOtpSentAt: Date,
    Profile_created_status: {
        type: Boolean,
        default: false
    }
});
export default mongoose.model("User", userSchema);

