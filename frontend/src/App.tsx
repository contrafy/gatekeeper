import "./App.css";
import { useEffect, useState } from "react";

import { ThemeProvider } from "./components/theme-provider";
import Header from "./components/Header";
import ProjectSelector from "./components/ProjectSelector";
import PromptContainer from "./components/PromptContainer";
import ResponseContainer from "./components/ResponseContainer";


function App() {
  /* ---- tiny blob that Prompt passes up, Response consumes -- */
  const [payload, setPayload] = useState<{
    policy: string;
    chatResponse: string;
    previousPrompt: string;
    showPolicyAnimation: boolean;
  }>({ policy: "", chatResponse: "", previousPrompt: "", showPolicyAnimation: false });
  // Authentication states
  const [token, setToken] = useState(""); // JWT token from Google OAuth

  // Project management states
  const [projects, setProjects] = useState<any[]>([]); // List of user's GCP projects
  const [selectedProject, setSelectedProject] = useState(""); // Currently selected project ID
  const [fetchingProjects, setFetchingProjects] = useState(false); // Loading state for project fetch
  const [projectError, setProjectError] = useState(""); // Project-related error messages
  
  // Load saved auth data from localStorage on component mount
  useEffect(() => {
    const savedToken = localStorage.getItem("token");

    if (savedToken) setToken(savedToken);
  }, []);

  // Persist token to localStorage when it changes
  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
      fetchProjects(); // Fetch projects when token is set
    } else {
      localStorage.removeItem("token");
    }
  }, [token]);

  /**
   * Fetches the user's GCP projects from the backend
   * Uses the authorization token for authentication
   */
  const fetchProjects = async () => {
    if (!token) return;
    
    setFetchingProjects(true);
    setProjectError("");
    
    try {
      console.log("Fetching projects with token:", token.substring(0, 10) + "...");
      const response = await fetch("http://localhost:8000/get_projects", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to fetch projects");
      }
      
      const data = await response.json();
      console.log("Projects fetched successfully:", data);
      
      if (Array.isArray(data)) {
        setProjects(data);
        
        // If we have projects and none selected, select the first one
        if (data.length > 0 && !selectedProject) {
          setSelectedProject(data[0].id);
        }
      } else {
        console.error("Invalid projects data format:", data);
        setProjectError("Received invalid projects data format");
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
      setProjectError(error instanceof Error ? error.message : "Unknown error fetching projects");
      setProjects([]);
    } finally {
      setFetchingProjects(false);
    }
  };


  return (
    <div>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        {/* HEADER SECTION */}
        <Header
          token={token}
          setToken={setToken}>
        </Header>

        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-full max-w-2xl shadow-lg mx-auto text-center px-6 py-[5%]">
            {/* Project Selector Section */}
            <ProjectSelector
              token={token}
              projects={projects}
              selectedProject={selectedProject}
              setSelectedProject={setSelectedProject}
              fetchingProjects={fetchingProjects}
              projectError={projectError}
              >
            </ProjectSelector>

            {/* Prompt Input Card */}
            <PromptContainer
              onResult={setPayload}
            ></PromptContainer>

            {/* Response Container */}
            <ResponseContainer
              data={payload}
              token={token}
              selectedProject={selectedProject}
            >
            </ResponseContainer>
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}

export default App;