import { useEffect } from "react";
import OutAndBackCalculator from "./components/OutAndBackCalculator.jsx";

export default function App() {
  useGeistFonts();
  return (
    <OutAndBackCalculator
      commitSha={import.meta.env.VITE_COMMIT_SHA ?? "dev"}
    />
  );
}

function useGeistFonts() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400..600&display=swap";
    document.head.appendChild(link);
    return () => {
      if (link.parentNode) link.parentNode.removeChild(link);
    };
  }, []);
}
