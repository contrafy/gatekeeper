import "./App.css";
import { FormEvent, useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
//------------ Shadcn Imports ------------
import { Button } from "@/components/ui/button";
import { Textarea } from "./components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
//------------------------
import {
  CredentialResponse,
  GoogleLogin,
  GoogleOAuthProvider,
  googleLogout,
} from "@react-oauth/google";
import { ThemeProvider } from "./components/theme-provider";
import { ModeToggle } from "./components/mode-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;

function App() {
  const [prompt, setPrompt] = useState("");
  const [previousPrompt, setPreviousPrompt] = useState("");
  const [policy, setPolicy] = useState("");
  const [chatResponse, setChatResponse] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const [userPicture, setUserPicture] = useState("");
  const [userName, setUserName] = useState("");

  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [fetchingProjects, setFetchingProjects] = useState(false);
  const [projectError, setProjectError] = useState("");

  // Fetch projects on component mount or when the token changes
  useEffect(() => {
    if (token) {
      fetchProjects();
    }
  }, [token]);
  
  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    const savedUserName = localStorage.getItem("userName");
    const savedUserPicture = localStorage.getItem("userPicture");

    if (savedToken) setToken(savedToken);
    if (savedUserName) setUserName(savedUserName);
    if (savedUserPicture) setUserPicture(savedUserPicture);
  }, []);

  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }, [token]);

  useEffect(() => {
    if (userName) {
      localStorage.setItem("userName", userName);
    } else {
      localStorage.removeItem("userName");
    }
  }, [userName]);

  useEffect(() => {
    if (userPicture) {
      localStorage.setItem("userPicture", userPicture);
    } else {
      localStorage.removeItem("userPicture");
    }
  }, [userPicture]);

  const handleGoogleSuccess = (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;

    // Store the token
    setToken(credentialResponse.credential);

    // Decode JWT to find the "picture" field
    const decoded: any = jwtDecode(credentialResponse.credential);

    if (decoded.picture) {
      setUserPicture(decoded.picture);
    }
    if (decoded.name) {
      setUserName(decoded.name);
    }
  };

  const handleSignOut = () => {
    console.debug("user is signing out");
    googleLogout();
    // Clear from state, which also clears from localStorage
    setToken("");
    setUserName("");
    setUserPicture("");
    setProjects([]);
    setSelectedProject("");
  };

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
  
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    setPreviousPrompt(prompt);
    setPrompt("");
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("http://localhost:8000/generate_policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Extract the JSON part from the response
      const fullResponse = data.policy;
      const jsonStartIndex = fullResponse.indexOf("{");
      const jsonEndIndex = fullResponse.lastIndexOf("}") + 1;

      if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
        // Extract the potential JSON string
        const jsonStr = fullResponse.substring(jsonStartIndex, jsonEndIndex);
        try {
          // Try to parse it to validate it's actually JSON
          const parsedJson = JSON.parse(jsonStr);
          // If successful, set the policy and chat response
          setPolicy(JSON.stringify(parsedJson, null, 2));
          // Get any text before the JSON as chat response
          const chatText = fullResponse.substring(0, jsonStartIndex).trim();
          setChatResponse(chatText || ""); // Set empty string if no chat text
        } catch (e) {
          // If JSON parsing fails, treat everything as chat
          setChatResponse(fullResponse);
          setPolicy("");
        }
      } else {
        // No JSON-like structure found, treat as chat
        setChatResponse(fullResponse);
        setPolicy("");
      }
    } catch (error) {
      console.error("Error generating policy:", error);
      setError("Failed to generate policy. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(policy);
  };

  // Changed to a functional component instead of dangerouslySetInnerHTML
const JsonTextarea = ({ text, onChange }: { text: string; onChange: (value: string) => void }) => {
  return (
    <Textarea
      className="policy-textbox w-full h-full font-mono"
      value={text}
      onChange={(e) => onChange(e.target.value)}
      rows={10}
    />
  );
};

  const isJsonString = (str: string): boolean => {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleApplyPolicy = async () => {
    if (!token) {
      setError("You must be signed in to apply policies");
      return;
    }
    
    if (!selectedProject) {
      setError("You must select a project before applying a policy");
      return;
    }
    
    try {
      setLoading(true);
      console.log("Applying policy:", policy);
      // Make sure we're sending properly formatted JSON
      let policyToSend = policy;
      try {
        // If policy is already a string representation of JSON, parse and validate it
        const parsed = JSON.parse(policy);
        // Ensure we have bindings
        if (!parsed.bindings) {
          // If we don't have bindings, wrap it properly
          policyToSend = JSON.stringify({ bindings: [] });
        }
      } catch (e) {
        console.error("Policy is not valid JSON:", e);
        setError("Policy is not valid JSON. Cannot apply.");
        setLoading(false);
        return;
      }
      
      const response = await fetch("http://localhost:8000/apply_policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "project-id": selectedProject,
        },
        body: JSON.stringify({ policy: policyToSend }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        const errorDetail = errorData.detail || "Failed to apply policy";
        console.error("API error details:", errorData);
        throw new Error(errorDetail);
      }
      
      const data = await response.json();
      console.log("Policy applied:", data);
      setChatResponse("Policy successfully applied to project!");
    } catch (error) {
      console.error("Error applying policy:", error);
      setError(error instanceof Error ? error.message : "Unknown error applying policy");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        {/* HEADER SECTION */}
        <header className="fixed top-0 w-full  border-b bg-black">
          <div className="flex items-center justify-between w-full px-7.5 py-2">
            {/* Left side: Title */}
            {/* Left side: shield + title in a row */}
            <div className="flex items-center space-x-2">
              <span role="img" aria-label="shield" className="text-xl">
                🛡️
              </span>
              <div className=" font-semibold text-white text-base">
                Google Cloud IAM Policy Generator
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <ModeToggle></ModeToggle>
              <GoogleOAuthProvider clientId={CLIENT_ID}>
                <div>
                  <div className="w-fit mx-auto">
                    {token ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Avatar className="cursor-pointer">
                            <AvatarImage src={userPicture} alt="Profile" />
                            <AvatarFallback>Me</AvatarFallback>
                          </Avatar>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuLabel>
                            {" "}
                            Signed in as {userName}{" "}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              className="cursor-pointer hover:bg-gray-200"
                              onClick={() => {
                                handleSignOut();
                              }}
                            >
                              Sign Out
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <GoogleLogin
                        shape="circle"
                        onSuccess={(credentialResponse) => {
                          console.debug("oauth success:", credentialResponse);
                          handleGoogleSuccess(credentialResponse);
                          if (credentialResponse.credential) {
                            setToken(credentialResponse.credential);
                          }
                        }}
                        onError={() => console.error("login failed")}
                      />
                    )}
                  </div>
                </div>
              </GoogleOAuthProvider>
            </div>
          </div>
        </header>

        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-full max-w-2xl shadow-lg mx-auto text-center px-6 py-[5%]">
            {/* Project Selector Above Prompt Section */}
            <div className="flex justify-end mb-4">
              {token ? (
                // Show project selector if signed in
                <>
                  {fetchingProjects ? (
                    <div className="bg-gray-100 border border-gray-300 rounded-md px-4 py-2 text-sm text-gray-700">
                      Loading projects...
                    </div>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="secondary">
                          {selectedProject && projects.length > 0
                            ? projects.find((p) => p.id === selectedProject)?.name || "Select Project"
                            : projects.length > 0 ? "Select Project" : "No Projects Found"}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Select a Project</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {projects.length > 0 ? (
                          projects.map((project) => (
                            <DropdownMenuItem
                              key={project.id}
                              onClick={() => setSelectedProject(project.id)}
                            >
                              {project.name}
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <DropdownMenuItem disabled>No projects available</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              ) : (
                // Show prompt to sign in
                <div className="bg-gray-100 border border-gray-300 rounded-md px-4 py-2 text-sm text-gray-700">
                  Please sign in with Google to select a project.
                </div>
              )}
            </div>

            {projectError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>
                  {projectError}
                </AlertDescription>
              </Alert>
            )}

            <Card className="text-left">
              <CardHeader>
                <CardTitle>Enter prompt</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit}>
                  <Textarea
                    placeholder="Describe your IAM policy requirements in plain English..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={6}
                    className="prompt-input"
                  />
                  <div className="py-2.5 flex justify-center">
                    <Button variant="dark" type="submit" disabled={loading}>
                      {loading ? (
                        <>
                          <span role="img" aria-label="loading">
                            ⚡
                          </span>{" "}
                          Generating...
                        </>
                      ) : (
                        <>
                          <span role="img" aria-label="generate">
                            ✨
                          </span>{" "}
                          Generate Policy
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
            {error && (
              <Alert variant="destructive" className="mt-4 mb-2">
                <AlertDescription className="flex items-center">
                  <span role="img" aria-label="error" className="mr-2">
                    ⚠️
                  </span>
                  {error}
                </AlertDescription>
              </Alert>
            )}
            <div className="response-container h-auto">
              {previousPrompt && (
                <div className="mb-2 text-left">
                  <strong>Prompt:</strong> {previousPrompt}
                </div>
              )}
              {policy && (
                <div className="policy-output mb-4 h-max">
                  <div className="output-header">
                    <h2>Generated Policy</h2>
                    {policy && token && selectedProject && (
                      <Button 
                        variant="dark" 
                        onClick={handleApplyPolicy} 
                        disabled={loading || !token || !selectedProject}
                      >
                        <span role="img" aria-label="apply">
                          🚀
                        </span>{" "}
                        Apply Policy
                      </Button>
                    )}
                    <Button variant="dark" onClick={handleCopy}>
                      <span role="img" aria-label="copy">
                        📋
                      </span>{" "}
                      Copy Policy
                    </Button>
                  </div>
                  <div className="rounded-md border">
                    {isJsonString(policy) ? (
                      <JsonTextarea 
                        text={policy} 
                        onChange={(newValue) => setPolicy(newValue)} 
                      />
                    ) : (
                      <pre className="policy-pre">{policy}</pre>
                    )}
                  </div>
                </div>
              )}

              {chatResponse && (
                <div className="chat-output">
                  <h2>Chat Response</h2>
                  <ScrollArea className="h-60">
                    <pre className="chat-pre">{chatResponse}</pre>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}

export default App;