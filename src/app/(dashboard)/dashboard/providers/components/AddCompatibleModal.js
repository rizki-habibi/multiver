"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Badge, Button, Input, Modal, Select } from "@/shared/components";

const API_TYPE_OPTIONS = [
  { value: "chat", label: "Chat Completions" },
  { value: "responses", label: "Responses API" },
];

// Base URL hint shown when the user picks the API style manually.
const STYLE_HINT = {
  openai: "Gunakan base URL (berakhiran /v1) untuk API kompatibel OpenAI.",
  anthropic: "Gunakan base URL (berakhiran /v1) untuk API kompatibel Anthropic. Sistem akan menambah /messages otomatis.",
};

function AddCompatibleModal({ isOpen, onClose, onCreated }) {
  const initialFormData = () => ({
    name: "",
    prefix: "",
    apiStyle: "openai",
    apiType: "chat",
    baseUrl: "https://api.openai.com/v1",
  });

  const [formData, setFormData] = useState(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [checkKey, setCheckKey] = useState("");
  const [checkModelId, setCheckModelId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState(null);

  const isAnthropic = formData.apiStyle === "anthropic";

  // Reset transient state every time the modal is (re)opened
  useEffect(() => {
    if (isOpen) {
      setCheckKey("");
      setCheckModelId("");
      setValidationResult(null);
      setDetectResult(null);
    }
  }, [isOpen]);

  // Anthropic nodes have no apiType selector — keep form consistent
  useEffect(() => {
    if (isAnthropic) {
      setFormData((prev) => ({ ...prev, apiType: "chat", baseUrl: "https://api.anthropic.com/v1" }));
    } else {
      setFormData((prev) => ({ ...prev, baseUrl: "https://api.openai.com/v1" }));
    }
  }, [formData.apiStyle]);

  // Auto-detect API style from baseUrl + apiKey (OpenAI vs Anthropic native)
  const handleDetect = async () => {
    setDetecting(true);
    setDetectResult(null);
    try {
      const res = await fetch("/api/provider-nodes/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: formData.baseUrl, apiKey: checkKey }),
      });
      const data = await res.json();
      if (res.ok) {
        setDetectResult(data);
        // Adopt the detected style so the rest of the form (prefix hint,
        // submit payload) matches the real endpoint.
        setFormData((prev) => ({
          ...prev,
          apiStyle: data.type === "anthropic-compatible" ? "anthropic" : "openai",
          apiType: data.apiType === "responses" ? "responses" : "chat",
        }));
      } else {
        setDetectResult({ error: data.error || "Deteksi gagal" });
      }
    } catch {
      setDetectResult({ error: "Network error" });
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.prefix.trim() || !formData.baseUrl.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/provider-nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          prefix: formData.prefix,
          type: isAnthropic ? "anthropic-compatible" : "openai-compatible",
          ...(isAnthropic ? {} : { apiType: formData.apiType }),
          baseUrl: formData.baseUrl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated(data.node);
        setFormData(initialFormData());
        setCheckKey("");
        setValidationResult(null);
        setDetectResult(null);
      }
    } catch (error) {
      console.log("Error creating compatible node:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await fetch("/api/provider-nodes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: checkKey,
          type: isAnthropic ? "anthropic-compatible" : "openai-compatible",
          modelId: checkModelId.trim() || undefined,
        }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch {
      setValidationResult({ valid: false, error: "Network error" });
    } finally {
      setValidating(false);
    }
  };

  const renderDetectResult = () => {
    if (!detectResult) return null;
    if (detectResult.error) {
      return (
        <div className="flex flex-col gap-1">
          <Badge variant="error">Deteksi Gagal</Badge>
          <span className="text-sm text-red-500">{detectResult.error}</span>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">
          {detectResult.type === "anthropic-compatible" ? "Anthropic" : "OpenAI"} Kompatibel
        </Badge>
        {!isAnthropic && (
          <span className="text-sm text-text-muted">
            {detectResult.apiType === "responses" ? "Responses API" : "Chat Completions"}
          </span>
        )}
        {detectResult.existingCount > 0 && (
          <span className="text-sm text-amber-500">
            Sudah ada {detectResult.existingCount} koneksi dengan base URL ini
          </span>
        )}
      </div>
    );
  };

  const renderValidationResult = () => {
    if (!validationResult) return null;
    const { valid, error, method } = validationResult;
    if (valid) {
      return (
        <>
          <Badge variant="success">Valid</Badge>
          {method === "chat" && (
            <span className="text-sm text-text-muted">(via inference test)</span>
          )}
        </>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="error">Invalid</Badge>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} title="Tambah API Keys Kompatibel" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-bg/50 p-3 text-sm text-text-muted">
          Masukkan Base URL dan API key, lalu klik <strong>Deteksi</strong> — sistem
          mengenali otomatis apakah endpoint ini kompatibel OpenAI atau Anthropic.
        </div>
        <Input
          label="Base URL"
          value={formData.baseUrl}
          onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
          placeholder="https://api.example.com/v1"
          hint={STYLE_HINT[formData.apiStyle]}
        />
        <Input
          label="API Key"
          type="password"
          value={checkKey}
          onChange={(e) => setCheckKey(e.target.value)}
          placeholder="Masukkan API key untuk deteksi & uji"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <Button
            onClick={handleDetect}
            disabled={!checkKey || detecting || !formData.baseUrl.trim()}
            variant="secondary"
            className="w-full sm:w-auto"
          >
            {detecting ? "Mendeteksi..." : "Deteksi"}
          </Button>
          {renderDetectResult()}
        </div>
        <Input
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Mis. Produksi"
          hint="Wajib. Label untuk node ini."
        />
        <Input
          label="Prefix"
          value={formData.prefix}
          onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
          placeholder="Mis. prod"
          hint="Wajib. Dipakai sebagai prefix model ID."
        />
        <Select
          label="Tipe API"
          options={API_TYPE_OPTIONS}
          value={formData.apiType}
          onChange={(e) => setFormData({ ...formData, apiType: e.target.value })}
        />
        <Input
          label="Model ID (opsional)"
          value={checkModelId}
          onChange={(e) => setCheckModelId(e.target.value)}
          placeholder="Mis. gpt-4, claude-3-opus"
          hint="Jika endpoint tidak punya /models, masukkan model ID untuk uji via chat/completions."
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            onClick={handleValidate}
            disabled={!checkKey || validating || !formData.baseUrl.trim()}
            variant="secondary"
            className="w-full sm:w-auto"
          >
            {validating ? "Menguji..." : "Uji API Key"}
          </Button>
          {renderValidationResult()}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleSubmit}
            fullWidth
            disabled={
              !formData.name.trim() ||
              !formData.prefix.trim() ||
              !formData.baseUrl.trim() ||
              submitting
            }
          >
            {submitting ? "Creating..." : "Create"}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

AddCompatibleModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};

export default AddCompatibleModal;
