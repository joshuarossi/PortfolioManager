import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Exchanges from "./pages/Exchanges";
import Portfolio from "./pages/Portfolio";
import Assistant from "./pages/Assistant";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/exchanges" element={<Exchanges />} />
        <Route path="/assistant" element={<Assistant />} />
      </Routes>
    </Layout>
  );
}
