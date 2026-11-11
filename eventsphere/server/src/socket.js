import jwt from 'jsonwebtoken';
import User from './models/User.js';
import Ticket from './models/Ticket.js';
import Event from './models/Event.js';
import ChatMessage from './models/ChatMessage.js';

/**
 * Real-time layer for virtual/hybrid sessions: live chat, Q&A,
 * emoji reactions and live attendee counts per room.
 */
export function initSocket(io) {
  io.use(async (socket, next) => {
    try {
      const { token } = socket.handshake.auth || {};
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = await User.findById(payload.id).select('name role');
      if (!socket.user) return next(new Error('unauthorized'));
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  const roomKey = (eventId, room) => `event:${eventId}:${room}`;
  const broadcastCount = (key) => io.to(key).emit('presence', { count: io.sockets.adapter.rooms.get(key)?.size || 0 });

  io.on('connection', (socket) => {
    socket.on('join', async ({ eventId, room = 'main' }, ack) => {
      try {
        const event = await Event.findById(eventId).select('organizer');
        const allowed =
          event &&
          (String(event.organizer) === String(socket.user._id) ||
            socket.user.role === 'admin' ||
            (await Ticket.exists({ event: eventId, user: socket.user._id })));
        if (!allowed) return ack?.({ ok: false, message: 'Register to join this event' });

        for (const r of socket.rooms) if (r.startsWith('event:')) { socket.leave(r); broadcastCount(r); }
        const key = roomKey(eventId, room);
        socket.join(key);
        socket.data.eventId = eventId;
        socket.data.room = room;
        broadcastCount(key);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, message: err.message });
      }
    });

    socket.on('message', async ({ text, kind = 'chat' }, ack) => {
      const { eventId, room } = socket.data;
      const clean = String(text || '').trim().slice(0, 1000);
      if (!eventId || !clean) return ack?.({ ok: false });
      const msg = await ChatMessage.create({
        event: eventId,
        room,
        user: socket.user._id,
        name: socket.user.name,
        text: clean,
        kind: kind === 'question' ? 'question' : 'chat',
      });
      io.to(roomKey(eventId, room)).emit('message', msg);
      ack?.({ ok: true });
    });

    socket.on('reaction', ({ emoji }) => {
      const { eventId, room } = socket.data;
      if (!eventId || !['👏', '🔥', '❤️', '😂', '🎉'].includes(emoji)) return;
      io.to(roomKey(eventId, room)).emit('reaction', { emoji });
    });

    socket.on('disconnecting', () => {
      for (const r of socket.rooms) if (r.startsWith('event:')) setTimeout(() => broadcastCount(r), 50);
    });
  });
}
