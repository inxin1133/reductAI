import { Routes, Route } from "react-router-dom"
import Intro from "@/pages/auth/Intro"
import FrontAI from "@/pages/aiagent/FrontAI"
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Intro />} />
      <Route path="/front-ai" element={<FrontAI />} />
    </Routes>
  )
}

export default App
