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
import { decode } from "punycode";
import { ThemeProvider } from "./components/theme-provider";
import { ModeToggle } from "./components/mode-toggle";


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

  const handleGoogleSuccess = (credentialResponse : CredentialResponse) => {
    if (!credentialResponse.credential) return;

    // Store the token
    setToken(credentialResponse.credential);

    // Decode JWT to find the "picture" field
    const decoded: any = jwtDecode(credentialResponse.credential);
    
    if (decoded.picture) {
      setUserPicture(decoded.picture);
    }
    if (decoded.name)
    {
      setUserName(decoded.name)
    }
    
  };

  const handleSignOut = () => {
    console.debug("user is signing out");
    googleLogout();
    // Clear from state, which also clears from localStorage
    setToken("");
    setUserName("");
    setUserPicture("");
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

  const highlightJson = (text: string): string => {
    try {
      // Try to parse as JSON first
      JSON.parse(text);
      // If successful, apply syntax highlighting
      return '<textarea class="policy-textbox">' + text + '</textarea>';
      /*
        .replace(/"([^"]+)":/g, '<span class="key">"$1"</span>:')
        .replace(/"([^"]+)"/g, '<span class="string">"$1"</span>')
        .replace(/\b(true|false)\b/g, '<span class="boolean">$1</span>')
        .replace(/\b(null)\b/g, '<span class="null">$1</span>')
        .replace(/\b(-?\d+\.?\d*)\b/g, '<span class="number">$1</span>')
        .replace(/[{[]/g, '<span class="bracket">$&</span>')
        .replace(/[}\]]/g, '<span class="bracket">$&</span>')
        .replace(/\n/g, '<br/>')
        .replace(/ /g, '&nbsp;')
        .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
    */
    } catch (e) {
      // If not valid JSON, return as plain text
      return text;
    }
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
    try {
      const response = await fetch("http://localhost:8000/apply_policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ policy }),
      });
      const data = await response.json();
      console.log("policy applied:", data);
    } catch (error) {
      console.error("error applying policy:", error);
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
              <div>
                <span role="img" aria-label="error">
                  ⚠️
                </span>{" "}
                {error}
              </div>
            )}
            <div className="response-container">
              {previousPrompt && (
                <div className="mb-2 text-left">
                  <strong>Prompt:</strong> {previousPrompt}
                </div>
              )}
              {policy && (
                <div className="policy-output">
                  <div className="output-header">
                    <h2>Generated Policy</h2>
                    {policy && (
                      <Button variant="dark" onClick={handleApplyPolicy}>
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
                  <ScrollArea className="h-60 rounded-md border">
                    <pre
                      className={`policy-pre ${
                        isJsonString(policy) ? "json" : ""
                      }`}
                      dangerouslySetInnerHTML={{
                        __html: highlightJson(policy),
                      }}
                    />
                  </ScrollArea>
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
