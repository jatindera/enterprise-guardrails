import {
  Button,
  MessageBar,
  MessageBarBody,
  Select,
} from "@fluentui/react-components";

export type CaptureMode = "manual" | "dictated" | "live";

interface MeetingCaptureProps {
  mode: CaptureMode;
  onChange: (mode: CaptureMode) => void;
}

export default function MeetingCapture({
  mode,
  onChange,
}: MeetingCaptureProps) {
  return (
    <section
      className="meeting-capture"
      aria-label="Meeting capture mode"
    >
      <label className="session-field">
        Answer capture mode

        <Select
          value={mode}
          onChange={(_, data) =>
            onChange(data.value as CaptureMode)
          }
        >
          <option value="manual">Manual notes</option>
          <option value="dictated">Dictated summary</option>
          <option value="live">
            Live meeting transcript — awaiting integration
          </option>
        </Select>
      </label>

      {mode === "manual" && (
        <MessageBar intent="info">
          <MessageBarBody>
            Type or paste the stakeholder’s answer. Capture a concise
            summary rather than transcribing every sentence.
          </MessageBarBody>
        </MessageBar>
      )}

      {mode === "dictated" && (
        <MessageBar intent="info">
          <MessageBarBody>
            Click the answer field and press <strong>Win + H</strong>
            {" "}to dictate your summary using Windows voice typing,
            if enabled. Check the words and speaker before analysis.
            This does not capture other meeting participants
            automatically.
          </MessageBarBody>
        </MessageBar>
      )}

      {mode === "live" && (
        <div>
          <MessageBar intent="warning">
            <MessageBarBody>
              Live transcription is awaiting meeting-platform
              integration. No microphone, meeting connection, or
              background recording is active. Live answers cannot
              be analyzed yet.
            </MessageBarBody>
          </MessageBar>

          <div className="capture-fallback-actions">
            <Button onClick={() => onChange("dictated")}>
              Use dictated summary
            </Button>

            <Button onClick={() => onChange("manual")}>
              Use manual notes
            </Button>
          </div>
        </div>
      )}

      <p className="workspace-secondary">
        Existing draft answers are preserved when switching modes.
      </p>
    </section>
  );
}