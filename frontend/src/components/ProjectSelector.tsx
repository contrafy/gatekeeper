// ProjectSelector.tsx
import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface Project {
  id: string;
  name: string;
}

interface ProjectSelectorProps {
  token: string;
  fetchingProjects: boolean;
  projects: Project[];
  selectedProject: string;
  setSelectedProject: (id: string) => void;
  projectError: string;
}

const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  token,
  fetchingProjects,
  projects,
  selectedProject,
  setSelectedProject,
  projectError,
}) => (
  <>
    <div className="flex justify-end mb-4">
      {token ? (
        fetchingProjects ? (
          <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
            Loading projects...
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="custom-green-hover">
                {selectedProject && projects.length > 0
                  ? projects.find((p) => p.id === selectedProject)?.name ||
                    "Select Project"
                  : projects.length > 0
                  ? "Select Project"
                  : "No Projects Found"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-[#4285F4]">
                Select a Project
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {projects.length > 0 ? (
                projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => setSelectedProject(project.id)}
                    className="hover:bg-[#4285F4]/10 hover:text-[#4285F4]"
                  >
                    {project.name}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>No projects available</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      ) : (
        <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
          Please sign in with Google to select a project.
        </div>
      )}
    </div>

    {projectError && (
      <Alert variant="destructive" className="mb-4 border-[#DB4437]">
        <AlertDescription className="flex items-center">
          <AlertTriangle className="h-4 w-4 mr-2 text-[#DB4437]" />
          {projectError}
        </AlertDescription>
      </Alert>
    )}
  </>
);

export default ProjectSelector;