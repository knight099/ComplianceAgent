import "./style.css";
export const metadata = {
  title: "ComplyOS · Access intelligence",
  description: "Evidence-backed access review and remediation",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
