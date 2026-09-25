"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";

const PLACEHOLDER = `[
  {
    "accessToken": "eyJhbGc...",
    "refreshToken": "rt_...",
    "idToken": "eyJhbGc...",
    "email": "user@example.com"
  }
]`;

function normalizeToArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.accounts)) return parsed.accounts;
    return [parsed];
  }
  return null;
}

export default function BulkImportCodexModal({ isOpen, onClose, onSuccess }) {
  const [jsonText, setJsonText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [parseError, setParseError] = useState("");
  const [result, setResult] = useState(null);

  const handleClose = () => {
    if (submitting) return;
    setJsonText("");
    setParseError("");
    setResult(null);
    onClose();
  };

  const handleSubmit = async () => {
    setParseError("");
    setResult(null);

    const trimmed = jsonText.trim();
    if (!trimmed) return;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      setParseError(`JSON tidak valid: ${err.message}`);
      return;
    }

    const accounts = normalizeToArray(parsed);
    if (!accounts || accounts.length === 0) {
      setParseError("Tidak ada akun ditemukan di input");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/oauth/codex/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setParseError(data?.error || `Request failed: ${res.status}`);
        return;
      }
      setResult(data);
      if (data.success > 0 && typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (err) {
      setParseError(err.message || "Permintaan gagal");
    } finally {
      setSubmitting(false);
    }
  };

  const failedItems = result?.results?.filter((r) => !r.ok) || [];

  return (
    <Modal isOpen={isOpen} title="Tambah Massal Akun Codex" onClose={handleClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-text-muted">
          Tempel array objek JSON akun codex. Setiap objek harus menyertakan accessToken (idealnya juga refreshToken, idToken).
        </p>

        <textarea
          className="w-full rounded border border-accent/30 bg-sidebar p-2 text-sm font-mono resize-y min-h-[240px] focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={PLACEHOLDER}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          disabled={submitting}
        />

        {parseError && (
          <p className="text-xs text-red-500 break-words">{parseError}</p>
        )}

        {result && (
          <div className="flex flex-col gap-2">
            <div
              className={`text-sm font-medium ${result.failed > 0 ? "text-yellow-400" : "text-green-400"
                }`}
            >
              ✓ {result.success} ditambahkan
              {result.failed > 0 ? `, ✗ ${result.failed} gagal` : ""}
            </div>
            {failedItems.length > 0 && (
              <ul className="rounded border border-accent/20 bg-sidebar/50 p-2 text-xs font-mono max-h-40 overflow-y-auto">
                {failedItems.map((item) => (
                  <li key={item.index} className="text-red-400">
                    [{item.index}] {item.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            fullWidth
            disabled={submitting || !jsonText.trim()}
          >
            {submitting ? "Mengimpor..." : "Impor Semua"}
          </Button>
          <Button onClick={handleClose} variant="ghost" fullWidth disabled={submitting}>
            Tutup
          </Button>
        </div>
      </div>
    </Modal>
  );
}

BulkImportCodexModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
};
