"use client";

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";

export default function ProviderIcon({
  src,
  providerId,
  baseUrl,
  alt,
  size = 32,
  className = "",
  fallbackText = "?",
  fallbackColor,
}) {
  const resolvedSrc = src || getProviderIconSrc(providerId, baseUrl);
  const [failedSrc, setFailedSrc] = useState(null);

  useEffect(() => setFailedSrc(null), [resolvedSrc]);

  if (resolvedSrc && failedSrc !== resolvedSrc) {
    return (
      <img
        src={resolvedSrc}
        alt={alt || providerId || "Ikon penyedia"}
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(resolvedSrc)}
        className={`inline-flex shrink-0 rounded-lg object-contain ${className}`.trim()}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
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
  providerId: PropTypes.string,
  baseUrl: PropTypes.string,
  alt: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  fallbackText: PropTypes.string,
  fallbackColor: PropTypes.string,
};
