import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

// The preview a shared link shows: the home page's valley, the Kavuntra mark and its one line. Made at build time.
export const alt = "Kavuntra: hiring shouldn't feel like a black box.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const valley = await readFile(path.join(process.cwd(), "public/hero/og.jpg"));
  const background = `data:image/jpeg;base64,${valley.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws plain img elements */}
        <img src={background} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0 }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 92,
            backgroundImage: "linear-gradient(180deg, rgba(242,237,227,0.82) 0%, rgba(242,237,227,0.35) 52%, rgba(242,237,227,0) 75%)",
          }}
        >
          <svg viewBox="0 0 100 120" width={58} height={70}>
            <path d="M2.6.8C17 9 27 22 27 40v78H3.2A3.2 3.2 0 0 1 0 114.8V3.4C0 1.2 1.2.1 2.6.8Z" fill="#2f5a5c" />
            <path d="M30 80c18-8 40-6 54 10 8 9 13 18 16 27-12 1.4-30-1-44-9-12-7-20-16-26-28Z" fill="#224047" />
            <path d="M2 118c10-22 20-46 38-64C56 38 78 32 100 33c-6 17-20 31-40 36-14 3-26 7-33 15C18 94 9 107 2 118Z" fill="#8fae86" />
          </svg>
          <div style={{ marginTop: 22, fontSize: 26, letterSpacing: 14, color: "#224047" }}>KAVUNTRA</div>
          <div style={{ marginTop: 34, fontSize: 64, fontWeight: 600, letterSpacing: -2, color: "#142a2e" }}>
            Hiring shouldn&apos;t feel like a black box.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
