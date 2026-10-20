import { useRef, useState } from "react";
import { Button } from "@fluentui/react-components";

interface FileDropZoneProps {
  label: string;
  extensions: string[];
  onFiles: (files: File[]) => void;
  maxSizeMB?: number;
}

export default function FileDropZone({
  label,
  extensions,
  onFiles,
  maxSizeMB = 20,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function receiveFiles(files: File[]) {
    setError("");
    setMessage("");

    if (files.length === 0) return;

    const invalid = files.find(
      (file) =>
        !extensions.some((extension) =>
          file.name.toLowerCase().endsWith(extension.toLowerCase())
        ) ||
        file.size === 0 ||
        file.size > maxSizeMB * 1024 * 1024
    );

    if (invalid) {
      setError(
        `No files added. Check "${invalid.name}". ` +
        `Allowed: ${extensions.join(", ")}. ` +
        `Each file must be nonempty and no larger than ${maxSizeMB} MB.`
      );
      return;
    }

    onFiles(files);

    setMessage(
      `${files.length} file${files.length === 1 ? "" : "s"} added locally.`
    );
  }

  return (
    <div className="file-upload-area">
      <div
        className="file-drop-zone"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          event.preventDefault();
          receiveFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <h3>{label}</h3>

        <p>Drag and drop files here, or select files below.</p>

        <input
          ref={inputRef}
          type="file"
          accept={extensions.join(",")}
          multiple
          hidden
          onChange={(event) => {
            receiveFiles(
              Array.from(event.currentTarget.files ?? [])
            );
            event.currentTarget.value = "";
          }}
        />

        <Button
          appearance="primary"
          onClick={() => inputRef.current?.click()}
        >
          Select files
        </Button>

        <p className="workspace-secondary">
          {extensions.join(", ")}
          {" · "}
          Up to {maxSizeMB} MB per file
          {" · "}
          Upload again anytime to add more
        </p>
      </div>

      {error && (
        <p className="session-error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="workspace-secondary" role="status">
          {message}
        </p>
      )}
    </div>
  );
}