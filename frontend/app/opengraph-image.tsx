import { ImageResponse } from "next/og";

// The preview a shared link shows: the sky, the Hirvello mark and the headline. Made at build time, no picture file.
export const alt = "Hirvello: talent is everywhere. Find the real ones.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#edf3fc",
          backgroundImage:
            "radial-gradient(circle at 88% 95%, rgba(50,102,255,0.55), rgba(50,102,255,0) 45%), radial-gradient(circle at 10% 5%, rgba(255,255,255,0.9), rgba(255,255,255,0) 40%), linear-gradient(160deg, #f9fbff 0%, #edf3fc 40%, #d6e6fc 75%, #b7d0f8 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg viewBox="0 0 64 64" width={56} height={56}>
            <rect width="64" height="64" rx="17" fill="#2456cf" />
            <path d="M18 24 32 41 46 24" fill="none" stroke="#f8fbff" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="46.5" cy="15" r="3.6" fill="#cfe4ff" />
          </svg>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -2, color: "#10213a" }}>
            hir<span style={{ color: "#2f6bff" }}>v</span>ello
          </div>
        </div>
        <div style={{ marginTop: 44, fontSize: 84, fontWeight: 500, letterSpacing: -4, lineHeight: 1, color: "#10213a" }}>
          Talent is everywhere.
        </div>
        <div style={{ marginTop: 12, display: "flex", fontSize: 84, fontWeight: 500, letterSpacing: -4, lineHeight: 1, color: "#10213a" }}>
          Find the&nbsp;<span style={{ color: "#2f6bff", fontStyle: "italic", fontWeight: 400 }}>real ones.</span>
        </div>
        <div style={{ marginTop: 36, fontSize: 22, letterSpacing: 6, color: "#2a3a52" }}>LESS NOISE. MORE SIGNAL.</div>
      </div>
    ),
    size,
  );
}
