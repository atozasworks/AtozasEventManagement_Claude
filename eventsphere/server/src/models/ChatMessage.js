import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    room: { type: String, default: 'main' }, // session id, booth id or "main"
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    text: { type: String, required: true, maxlength: 1000 },
    kind: { type: String, enum: ['chat', 'question'], default: 'chat' },
  },
  { timestamps: true }
);

chatMessageSchema.index({ event: 1, room: 1, createdAt: -1 });

export default mongoose.model('ChatMessage', chatMessageSchema);
