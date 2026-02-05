import mongoose from "mongoose";

const profileSchema = new mongoose.Schema({
    name:String,
    email:String,
    bio:String,
    gender:String,
});
export default mongoose.model("Profile", profileSchema);

