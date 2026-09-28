import PropTypes from "prop-types";

/** Teks-only fallback. Tidak pernah merender <img>, tidak pernah fetch. */
export default function ProviderIcon({ size = 32, className = "", fallbackText = "?", fallbackColor }) {
  return (
    <span
      className={`inline-flex items-center justify-center font-bold rounded-lg ${className}`.trim()}
      style={{
        width: size,
        height: size,
        color: fallbackColor,
        fontSize: Math.max(10, Math.floor(size * 0.38)),
      }}
    >
      {fallbackText}
    </span>
  );
}

ProviderIcon.propTypes = {
  src: PropTypes.string,
  providerId: PropTypes.string,
  alt: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  fallbackText: PropTypes.string,
  fallbackColor: PropTypes.string,
};
