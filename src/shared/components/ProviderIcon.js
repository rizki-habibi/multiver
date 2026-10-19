"use client";

import { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { getProviderIconCandidates } from "@/shared/utils/providerIcon";

export default function ProviderIcon({
  src,
  iconUrl,
  providerId,
  baseUrl,
  alt,
  size = 32,
  className = "",
  fallbackText = "?",
  fallbackColor,
}) {
  const candidates = useMemo(() => {
    const resolved = getProviderIconCandidates(providerId, baseUrl, iconUrl);
    if (src && /^https?:\/\//i.test(src) && !resolved.includes(src)) resolved.unshift(src);
    return resolved;
  }, [src, iconUrl, providerId, baseUrl]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const resolvedSrc = candidates[candidateIndex] || null;

  useEffect(() => setCandidateIndex(0), [candidates.join("|")]);

  if (resolvedSrc) {
    return (
      <img
        src={resolvedSrc}
        alt={alt || providerId || "Ikon penyedia"}
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setCandidateIndex((index) => Math.min(index + 1, candidates.length))}
        className={`inline-flex shrink-0 rounded-lg object-contain ${className}`.trim()}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={alt || providerId || "Ikon penyedia"}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-bold ${className}`.trim()}
      style={{ width: size, height: size, color: fallbackColor, fontSize: Math.max(10, Math.floor(size * 0.38)) }}
    >
      {fallbackText}
    </span>
  );
}

ProviderIcon.propTypes = {
  src: PropTypes.string,
  iconUrl: PropTypes.string,
  providerId: PropTypes.string,
  baseUrl: PropTypes.string,
  alt: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  fallbackText: PropTypes.string,
  fallbackColor: PropTypes.string,
};
