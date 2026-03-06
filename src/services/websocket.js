let socket = null;

export const connectWebSocket = () => {
  socket = new WebSocket(import.meta.env.VITE_WS_URL);

  socket.onopen = () => {
    console.log("WebSocket connected");
  };

  socket.onclose = () => {
    console.log("WebSocket disconnected");
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  return socket;
};

export const getSocket = () => socket;