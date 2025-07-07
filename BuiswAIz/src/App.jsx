import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [pythonMessage, setPythonMessage] = useState('')
  const [csharpMessage, setCsharpMessage] = useState('')

  useEffect(() => {
    // Call Python backend
    fetch('http://localhost:8000/api/hello')
      .then(res => res.json())
      .then(data => setPythonMessage(data.message))
      .catch(err => console.error('Python backend error:', err))

    // Call C# backend
    fetch('http://localhost:5273/api/hello')

      .then(res => res.json())
      .then(data => setCsharpMessage(data.message))
      .catch(err => console.error('C# backend error:', err))
  }, [])

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>

      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>

      <div className="card">
        <h3>Backend Responses:</h3>
        <p><strong>Python:</strong> {pythonMessage || 'Loading...'}</p>
        <p><strong>C#:</strong> {csharpMessage || 'Loading...'}</p>
      </div>

      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
