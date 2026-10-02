import "./globals.css";

export const metadata = {
  title: "USD Tether (USDT) on Monad",
  description: "USD Tether dashboard on Monad",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
