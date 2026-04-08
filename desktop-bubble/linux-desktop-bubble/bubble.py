#!/usr/bin/env python3
"""
Desktop AI Bubble — Floating assistant for Pop_OS!
Uses Claude Haiku + screenshots for visual troubleshooting
"""

import gi
gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("GdkPixbuf", "2.0")

from gi.repository import Gtk, Gdk, GdkPixbuf, GLib, Pango
import threading
import base64
import os
import sys
import json
import urllib.request
import urllib.error

import anthropic

OLLAMA_HOST  = os.environ.get("OLLAMA_HOST", "")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "")

MODELS = [
    ("Haiku 4.5  — fast",    "claude-haiku-4-5-20251001"),
    ("Sonnet 4.6 — balanced", "claude-sonnet-4-6"),
    ("Opus 4.6   — powerful", "claude-opus-4-6"),
]
if OLLAMA_HOST and OLLAMA_MODEL:
    MODELS.append((f"Ollama — {OLLAMA_MODEL}", f"ollama/{OLLAMA_MODEL}"))

DEFAULT_MODEL_INDEX = 0

BUBBLE_SIZE = 64
PANEL_WIDTH = 420
PANEL_HEIGHT = 560

# C3S brand palette — navy/blue
BG_DARK   = "#050f3c"   # rgba(5,15,60) solid
BG_MID    = "#0a1a60"   # lighter navy
BG_CARD   = "#0d1f7a"   # card tint
ACCENT    = "#0924a5"   # rgb(9,36,165) primary blue
ACCENT2   = "#1e46dc"   # rgb(30,70,220) hover blue
TEXT_PRI  = "#e8eaf6"
TEXT_SEC  = "rgba(255, 255, 255, 0.7)"
SUCCESS   = "#a6e3a1"   # keep green for success states
ERROR_COL = "#ff8a80"


CSS = f"""
* {{
    font-family: "Inter", "Ubuntu", sans-serif;
}}

#bubble {{
    background: {ACCENT};
    border-radius: 32px;
    border: 2px solid rgba(255,255,255,0.15);
    transition: all 200ms ease;
}}

#bubble:hover {{
    background: {ACCENT2};
}}

#panel {{
    background: {BG_DARK};
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.08);
}}

#panel-header {{
    background: {BG_MID};
    border-radius: 16px 16px 0 0;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
}}

#title-label {{
    color: {TEXT_PRI};
    font-size: 14px;
    font-weight: 600;
}}

#subtitle-label {{
    color: {TEXT_SEC};
    font-size: 11px;
}}

#chat-scroll {{
    background: {BG_DARK};
}}

#chat-box {{
    background: {BG_DARK};
    padding: 8px;
}}

.message-user {{
    background: {BG_CARD};
    border-radius: 12px 12px 4px 12px;
    padding: 10px 14px;
    color: {TEXT_PRI};
    font-size: 13px;
    margin: 4px 0 4px 40px;
}}

.message-ai {{
    background: {BG_MID};
    border-radius: 12px 12px 12px 4px;
    padding: 10px 14px;
    color: {TEXT_PRI};
    font-size: 13px;
    margin: 4px 40px 4px 0;
    border-left: 3px solid {ACCENT};
}}

.message-system {{
    color: {TEXT_SEC};
    font-size: 11px;
    font-style: italic;
    padding: 4px 12px;
}}

#input-area {{
    background: {BG_MID};
    border-radius: 0 0 16px 16px;
    padding: 10px;
    border-top: 1px solid rgba(255,255,255,0.06);
}}

#text-input {{
    background: {BG_CARD};
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: {TEXT_PRI};
    padding: 8px 12px;
    font-size: 13px;
    caret-color: {ACCENT};
}}

#text-input:focus {{
    border-color: {ACCENT};
    outline: none;
}}

#btn-send {{
    background: {ACCENT};
    border: none;
    border-radius: 8px;
    color: #ffffff;
    font-weight: 600;
    font-size: 13px;
    padding: 8px 16px;
    min-width: 64px;
}}

#btn-send:hover {{
    background: {ACCENT2};
}}

#btn-send:disabled {{
    background: rgba(255,255,255,0.1);
    color: {TEXT_SEC};
}}

#btn-screenshot {{
    background: {BG_CARD};
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: {TEXT_PRI};
    font-size: 12px;
    padding: 6px 12px;
}}

#btn-screenshot:hover {{
    border-color: {ACCENT};
    color: {ACCENT};
}}

#btn-clear {{
    background: transparent;
    border: none;
    color: {TEXT_SEC};
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
}}

#btn-clear:hover {{
    color: {ERROR_COL};
}}

#btn-close {{
    background: transparent;
    border: none;
    color: {TEXT_SEC};
    font-size: 16px;
    padding: 0 4px;
    border-radius: 4px;
    min-width: 24px;
}}

#btn-close:hover {{
    color: {ERROR_COL};
    background: rgba(255,100,80,0.1);
}}

#model-badge {{
    background: rgba(9,36,165,0.15);
    border: 1px solid rgba(9,36,165,0.3);
    border-radius: 6px;
    color: {ACCENT};
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    letter-spacing: 0.5px;
}}
"""


TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

SYSTEM_PROMPT = (
    "You are a helpful desktop assistant for Pop_OS! Linux. "
    "Be concise and practical. When analyzing screenshots, "
    "identify issues clearly and suggest specific fixes. "
    "Use plain text — no markdown headers, minimal bullets."
)


def fetch_tavily_context(query: str, key: str) -> str:
    """Search Tavily and return formatted results, or '' on any error."""
    payload = json.dumps({"api_key": key, "query": query, "max_results": 3}).encode()
    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
        return "\n\n".join(
            f"{x['title']}: {x['content']}" for x in data.get("results", [])
        )
    except Exception:
        return ""


def take_screenshot() -> str | None:
    """Capture full screen via PIL, return base64-encoded PNG."""
    try:
        from PIL import ImageGrab
        import io
        img = ImageGrab.grab()
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.standard_b64encode(buf.getvalue()).decode("utf-8")
    except Exception:
        return None


def apply_css():
    provider = Gtk.CssProvider()
    provider.load_from_data(CSS.encode())
    Gtk.StyleContext.add_provider_for_screen(
        Gdk.Screen.get_default(),
        provider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
    )


def to_ollama_messages(messages: list, system_prompt: str) -> list:
    """Convert Anthropic-format messages to Ollama's simpler format."""
    result = [{"role": "system", "content": system_prompt}]
    for m in messages:
        if isinstance(m["content"], list):
            text = "".join(b["text"] for b in m["content"] if b.get("type") == "text")
            images = [b["source"]["data"] for b in m["content"] if b.get("type") == "image"]
        else:
            text = m["content"] or ""
            images = []
        msg = {"role": m["role"], "content": text}
        if images:
            msg["images"] = images
        result.append(msg)
    return result


class OllamaThread(threading.Thread):
    """Streams a response from a local Ollama instance off the GTK main thread."""

    def __init__(self, messages, model, host, on_chunk, on_done, on_error, system_prompt=None):
        super().__init__(daemon=True)
        self.messages = messages
        self.model = model  # already stripped of 'ollama/' prefix by caller
        self.host = host
        self.on_chunk = on_chunk
        self.on_done = on_done
        self.on_error = on_error
        self.system_prompt = system_prompt or SYSTEM_PROMPT

    def run(self):
        try:
            ollama_msgs = to_ollama_messages(self.messages, self.system_prompt)
            payload = json.dumps({
                "model": self.model,
                "messages": ollama_msgs,
                "stream": True,
            }).encode()
            req = urllib.request.Request(
                f"{self.host}/api/chat",
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            full = []
            with urllib.request.urlopen(req) as resp:
                for raw_line in resp:
                    line = raw_line.strip()
                    if not line:
                        continue
                    try:
                        evt = json.loads(line)
                    except Exception:
                        continue
                    chunk = evt.get("message", {}).get("content", "")
                    if chunk:
                        full.append(chunk)
                        GLib.idle_add(self.on_chunk, chunk)
                    if evt.get("done"):
                        break
            GLib.idle_add(self.on_done, "".join(full))
        except Exception as e:
            GLib.idle_add(self.on_error, str(e))


class AIThread(threading.Thread):
    """Runs Claude API call off the main GTK thread."""

    def __init__(self, client, messages, model, on_chunk, on_done, on_error, system_prompt=None):
        super().__init__(daemon=True)
        self.client = client
        self.messages = messages
        self.model = model
        self.on_chunk = on_chunk
        self.on_done = on_done
        self.on_error = on_error
        self.system_prompt = system_prompt or SYSTEM_PROMPT

    def run(self):
        try:
            full = []
            with self.client.messages.stream(
                model=self.model,
                max_tokens=1024,
                system=self.system_prompt,
                messages=self.messages,
            ) as stream:
                for text in stream.text_stream:
                    full.append(text)
                    GLib.idle_add(self.on_chunk, text)
            GLib.idle_add(self.on_done, "".join(full))
        except Exception as e:
            GLib.idle_add(self.on_error, str(e))


class ChatPanel(Gtk.Window):
    def __init__(self, bubble_window):
        super().__init__(type=Gtk.WindowType.TOPLEVEL)
        self.bubble = bubble_window
        self.client = anthropic.Anthropic()
        self.history = []
        self.pending_screenshot = None
        self.is_streaming = False
        self.current_ai_label = None

        self._build_ui()
        self._reposition()

    def _build_ui(self):
        self.set_name("panel")
        self.set_decorated(False)
        self.set_keep_above(True)
        self.set_default_size(PANEL_WIDTH, PANEL_HEIGHT)
        self.set_resizable(False)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)

        screen = self.get_screen()
        visual = screen.get_rgba_visual()
        if visual:
            self.set_visual(visual)
        self.set_app_paintable(True)

        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        outer.set_name("panel")
        self.add(outer)

        # ── Header ──
        header = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        header.set_name("panel-header")

        icon_lbl = Gtk.Label(label="◉")
        icon_lbl.set_markup(f'<span color="{ACCENT}" font="16">◉</span>')

        info = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        title = Gtk.Label(label="AI Bubble")
        title.set_name("title-label")
        title.set_halign(Gtk.Align.START)
        subtitle = Gtk.Label(label="Pop_OS! assistant")
        subtitle.set_name("subtitle-label")
        subtitle.set_halign(Gtk.Align.START)
        info.pack_start(title, False, False, 0)
        info.pack_start(subtitle, False, False, 0)

        self.model_combo = Gtk.ComboBoxText()
        self.model_combo.set_name("model-badge")
        for label, _model_id in MODELS:
            self.model_combo.append_text(label)
        self.model_combo.set_active(DEFAULT_MODEL_INDEX)

        btn_clear = Gtk.Button(label="clear")
        btn_clear.set_name("btn-clear")
        btn_clear.connect("clicked", self._on_clear)

        btn_close = Gtk.Button(label="✕")
        btn_close.set_name("btn-close")
        btn_close.connect("clicked", lambda _: self.hide())

        header.pack_start(icon_lbl, False, False, 0)
        header.pack_start(info, False, False, 4)
        header.pack_start(self.model_combo, False, False, 0)
        header.pack_end(btn_close, False, False, 0)
        header.pack_end(btn_clear, False, False, 0)
        outer.pack_start(header, False, False, 0)

        # ── Chat scroll ──
        scroll = Gtk.ScrolledWindow()
        scroll.set_name("chat-scroll")
        scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scroll.set_vexpand(True)

        self.chat_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        self.chat_box.set_name("chat-box")
        self.chat_box.set_valign(Gtk.Align.END)
        self.chat_box.set_vexpand(True)

        scroll.add(self.chat_box)
        outer.pack_start(scroll, True, True, 0)
        self._scroll = scroll

        # ── Input area ──
        input_area = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6)
        input_area.set_name("input-area")

        # Screenshot row
        ss_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        self.ss_label = Gtk.Label(label="No screenshot attached")
        self.ss_label.set_name("model-badge")
        self.ss_label.set_halign(Gtk.Align.START)
        self.ss_label.set_hexpand(True)
        self.ss_label.get_style_context().add_class("message-system")

        btn_ss = Gtk.Button(label="📷  Screenshot")
        btn_ss.set_name("btn-screenshot")
        btn_ss.connect("clicked", self._on_screenshot)

        ss_row.pack_start(self.ss_label, True, True, 0)
        ss_row.pack_end(btn_ss, False, False, 0)
        input_area.pack_start(ss_row, False, False, 0)

        # Text + send row
        send_row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)

        self.text_input = Gtk.Entry()
        self.text_input.set_name("text-input")
        self.text_input.set_placeholder_text("Ask anything about your screen…")
        self.text_input.set_hexpand(True)
        self.text_input.connect("activate", self._on_send)

        self.btn_send = Gtk.Button(label="Send")
        self.btn_send.set_name("btn-send")
        self.btn_send.connect("clicked", self._on_send)

        send_row.pack_start(self.text_input, True, True, 0)
        send_row.pack_end(self.btn_send, False, False, 0)
        input_area.pack_start(send_row, False, False, 0)

        outer.pack_start(input_area, False, False, 0)
        self.show_all()

        self._add_system_msg("Ready. Take a screenshot or just ask a question.")

    def _reposition(self):
        """Position panel next to the bubble."""
        bx, by = self.bubble.get_position()
        bw = BUBBLE_SIZE
        display = Gdk.Display.get_default()
        monitor = display.get_primary_monitor() or display.get_monitor(0)
        geo = monitor.get_geometry()
        sw, sh = geo.width, geo.height

        # Place to the left if near right edge
        if bx + bw + PANEL_WIDTH + 8 > sw:
            px = bx - PANEL_WIDTH - 8
        else:
            px = bx + bw + 8

        py = max(0, by - PANEL_HEIGHT // 2 + BUBBLE_SIZE // 2)
        if py + PANEL_HEIGHT > sh:
            py = sh - PANEL_HEIGHT - 8

        self.move(px, py)

    # ── Message helpers ──

    def _add_system_msg(self, text: str):
        lbl = Gtk.Label(label=text)
        lbl.get_style_context().add_class("message-system")
        lbl.set_halign(Gtk.Align.CENTER)
        lbl.set_line_wrap(True)
        lbl.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR)
        lbl.set_max_width_chars(50)
        self.chat_box.pack_start(lbl, False, False, 2)
        self.chat_box.show_all()
        self._scroll_bottom()

    def _add_user_msg(self, text: str):
        lbl = Gtk.Label(label=text)
        lbl.get_style_context().add_class("message-user")
        lbl.set_halign(Gtk.Align.END)
        lbl.set_line_wrap(True)
        lbl.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR)
        lbl.set_max_width_chars(40)
        lbl.set_selectable(True)
        self.chat_box.pack_start(lbl, False, False, 2)
        self.chat_box.show_all()
        self._scroll_bottom()

    def _add_ai_msg_start(self) -> Gtk.Label:
        lbl = Gtk.Label(label="")
        lbl.get_style_context().add_class("message-ai")
        lbl.set_halign(Gtk.Align.START)
        lbl.set_line_wrap(True)
        lbl.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR)
        lbl.set_max_width_chars(46)
        lbl.set_selectable(True)
        self.chat_box.pack_start(lbl, False, False, 2)
        self.chat_box.show_all()
        self._scroll_bottom()
        return lbl

    def _scroll_bottom(self):
        def _do():
            adj = self._scroll.get_vadjustment()
            adj.set_value(adj.get_upper())
        GLib.idle_add(_do)

    # ── Actions ──

    def _on_screenshot(self, _btn):
        self._add_system_msg("Capturing screen…")
        self.btn_send.set_sensitive(False)

        def capture():
            data = take_screenshot()
            GLib.idle_add(self._screenshot_done, data)

        threading.Thread(target=capture, daemon=True).start()

    def _screenshot_done(self, data: str | None):
        if data:
            self.pending_screenshot = data
            self.ss_label.set_text("✓ Screenshot attached")
            self._add_system_msg("Screenshot captured — ask what you need help with.")
        else:
            self.ss_label.set_text("Screenshot failed")
            self._add_system_msg("Could not capture screen. Try: sudo apt install scrot")
        self.btn_send.set_sensitive(True)

    def _on_send(self, _widget):
        if self.is_streaming:
            return

        text = self.text_input.get_text().strip()
        if not text and not self.pending_screenshot:
            return

        display = text or "(screenshot only)"
        self._add_user_msg(display)
        self.text_input.set_text("")

        # Build message content
        content = []
        if self.pending_screenshot:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": self.pending_screenshot,
                },
            })
            self.pending_screenshot = None
            self.ss_label.set_text("No screenshot attached")

        if text:
            content.append({"type": "text", "text": text})

        if not content:
            return

        self.history.append({"role": "user", "content": content})

        self.is_streaming = True
        self.btn_send.set_sensitive(False)
        self.current_ai_label = self._add_ai_msg_start()
        self._accumulated = []

        # Enrich system prompt with Tavily web search if key is set
        system_prompt = SYSTEM_PROMPT
        if TAVILY_API_KEY and text:
            context = fetch_tavily_context(text, TAVILY_API_KEY)
            if context:
                system_prompt = SYSTEM_PROMPT + f"\n\nWeb search context:\n{context}"

        selected_model = MODELS[self.model_combo.get_active()][1]

        if selected_model.startswith("ollama/"):
            ollama_model = selected_model[len("ollama/"):]
            OllamaThread(
                messages=self.history,
                model=ollama_model,
                host=OLLAMA_HOST or "http://localhost:11434",
                on_chunk=self._on_chunk,
                on_done=self._on_ai_done,
                on_error=self._on_ai_error,
                system_prompt=system_prompt,
            ).start()
        else:
            AIThread(
                client=self.client,
                messages=self.history,
                model=selected_model,
                on_chunk=self._on_chunk,
                on_done=self._on_ai_done,
                on_error=self._on_ai_error,
                system_prompt=system_prompt,
            ).start()

    def _on_chunk(self, text: str):
        self._accumulated.append(text)
        self.current_ai_label.set_text("".join(self._accumulated))
        self._scroll_bottom()

    def _on_ai_done(self, full_text: str):
        self.history.append({"role": "assistant", "content": full_text})
        self.is_streaming = False
        self.btn_send.set_sensitive(True)
        self.current_ai_label = None

    def _on_ai_error(self, error: str):
        self.current_ai_label.set_markup(
            f'<span color="{ERROR_COL}">Error: {GLib.markup_escape_text(error)}</span>'
        )
        self.is_streaming = False
        self.btn_send.set_sensitive(True)

    def _on_clear(self, _btn):
        self.history.clear()
        self.pending_screenshot = None
        self.ss_label.set_text("No screenshot attached")
        for child in self.chat_box.get_children():
            self.chat_box.remove(child)
        self._add_system_msg("Conversation cleared.")


class BubbleWindow(Gtk.Window):
    def __init__(self):
        super().__init__(type=Gtk.WindowType.TOPLEVEL)
        self._drag_start = None
        self._panel = None
        self._build()

    def _build(self):
        self.set_decorated(False)
        self.set_keep_above(True)
        self.set_default_size(BUBBLE_SIZE, BUBBLE_SIZE)
        self.set_resizable(False)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)
        self.set_app_paintable(True)

        screen = self.get_screen()
        visual = screen.get_rgba_visual()
        if visual:
            self.set_visual(visual)

        # Position: bottom-right corner
        display = Gdk.Display.get_default()
        monitor = display.get_primary_monitor() or display.get_monitor(0)
        geo = monitor.get_geometry()
        sw, sh = geo.width, geo.height
        self.move(sw - BUBBLE_SIZE - 24, sh - BUBBLE_SIZE - 48)

        btn = Gtk.Button()
        btn.set_name("bubble")
        btn.set_size_request(BUBBLE_SIZE, BUBBLE_SIZE)
        lbl = Gtk.Label()
        lbl.set_markup(f'<span font="22">◉</span>')
        btn.add(lbl)
        self.add(btn)

        btn.connect("clicked", self._on_click)
        btn.connect("button-press-event", self._on_press)
        btn.connect("motion-notify-event", self._on_motion)
        btn.add_events(
            Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.POINTER_MOTION_MASK
        )

        self.connect("draw", self._on_draw)
        self.show_all()

    def _on_draw(self, _widget, ctx):
        """Transparent background for the window itself."""
        ctx.set_source_rgba(0, 0, 0, 0)
        ctx.set_operator(1)  # cairo.OPERATOR_SOURCE
        ctx.paint()
        return False

    def _on_press(self, _widget, event):
        if event.button == 1:
            wx, wy = self.get_position()
            self._drag_start = (event.x_root - wx, event.y_root - wy)
            self._did_drag = False

    def _on_motion(self, _widget, event):
        if self._drag_start and (event.state & Gdk.ModifierType.BUTTON1_MASK):
            ox, oy = self._drag_start
            nx = int(event.x_root - ox)
            ny = int(event.y_root - oy)
            self.move(nx, ny)
            self._did_drag = True
            if self._panel and self._panel.get_visible():
                self._panel._reposition()

    def _on_click(self, _btn):
        if getattr(self, "_did_drag", False):
            self._did_drag = False
            return
        if self._panel is None:
            self._panel = ChatPanel(self)
        if self._panel.get_visible():
            self._panel.hide()
        else:
            self._panel._reposition()
            self._panel.show_all()
            self._panel.present()


def main():
    apply_css()

    # Verify API key
    if not os.environ.get("ANTHROPIC_API_KEY"):
        dialog = Gtk.MessageDialog(
            message_type=Gtk.MessageType.ERROR,
            buttons=Gtk.ButtonsType.OK,
            text="ANTHROPIC_API_KEY not set",
        )
        dialog.format_secondary_text(
            "Export your key before running:\n"
            "  export ANTHROPIC_API_KEY=sk-..."
        )
        dialog.run()
        dialog.destroy()
        sys.exit(1)

    app = BubbleWindow()
    app.connect("destroy", Gtk.main_quit)
    Gtk.main()


if __name__ == "__main__":
    main()
