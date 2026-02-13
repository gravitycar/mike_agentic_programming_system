# Mike’s Agentic Programming System (MAPS)

## My Goal 
to have an LLM-powered software development system that helps me explore topics I don’t understand, keeps me informed of what it’s going to to do before doing it, and handles all of the solved-problem drudgery and record keeping for me. 

This system will accept a relatively brief description of the software I want to create or changes to an existing system I want to make. Then it will help me compose a detailed specification document. It deliberately search for open questions, gaps, missing features, un-recognized dependencies. It will work interactively with me about these open questions until they are resolved. Each resolved open question may update the specification. Then it will generate an “implementation catalog”, which is a very concise but complete list of every step in the implementation process. Next, it one implementation plan document for every item in the implementation catalog. Then it will build each separate implementation plan, each in its own separate process. Then it will run units tests. If unit tests fail, it will revise the relevant implementation plan and rebuild until the tests pass. Then it will run integration tests, and revise and rebuild and retest until the integration tests pass.


## Known issues with agentic coding
* Product Specs and implementation plans, can be big. Bigger than Claude's context window.

* Software is complex and detailed. Losing track of details is inevitable when the size of prompts and prompt history exceeds the size of the context window. This loss degrades the quality of agentically generated software.

* A very broad, general spec lacks the detail needed to produce good code reliably.

* A very detailed spec is too large, exceeds the context window, and results in poor or incomplete results.

* Specs that are not given a critical review may have hidden flaws the human developer hasn’t thought of or doesn’t know about.

* A lack of templates and guidelines for writing specs can make the process unreliable.

* Compression of context data is necessary but cumbersome for humans. 


## How we want to address these concerns
Start with a “back of the napkin” summary of what the project is.

Use a multi-step process where each step is handled by 1 agent, providing a much smaller context window and a much more specific, confined goal.

Use an iterative process that loops over write/test/review/revise steps until we have no more revisions to make.

Create guidelines for writing specs that help our agents produce consistent specs across multiple projects.

Use a “compressor” class that will take human-friendly markdown and remove any unnecessary formatting to conserve our context window space.


## Workflow - soup to nuts
1. User -> Describes the problem statement/goal of this software project. This is a general, broad statement defining a problem and solution, or a goal, or a general description of what the project should accomplish.
2. Agent ->Take stock of the current state of the codebase. Summarize.
3. Agent -> Search the web for articles about the problem domain. Summarize.
4. Agent -> Using training data, current state and research, write a specification document based on a specification template and guidelines. This document should contain NO CODE examples. Descriptions of what various components should do may be complex but should avoid implementation-specific details like sample code. The specification document should list acceptance criteria. 
5. Agent -> Critical Review #1. Review the spec and add "Open Questions" section for any unaddressed questions. 
6. User -> Review Spec. Provide feedback/changes/corrections. 
7. User -> Review and resolve all open questions.
8. Agent -> Critical Review #2. Review the revised spec for any new or still unaddressed open questions.
9. User -> Address open questions. 
10. User -> Sign-off on spec. 
11. Agent -> Build an implementation catalog document from the spec. This is everything we need to build, but not the specific details of how it will be built. The items in the catalog could be things like "Create a class to connect to a service's API" or "add a new method to an existing class". But NO CODE EXAMPLES. Each item in the catalog should be fairly discrete, no more than 3 files.
12. Agent -> Create an implementation plan for every item in the implementation catalog. This is where all the details go. Code examples are welcome here. Each implementation plan should include a summary of the larger goals of the specification and this specific plan's place in that larger specification. Implementation plans should also detail unit tests. Implementation plans may specify creating multiple new files or updating multiple existing files. Some implementation plans may be blocked by other implementation plans.
13. Agent -> Critical Review #3. Review each implementation plan. For any open questions found, review the previously answered open questions to see if these concerns have been addressed but the resolutions to the relevant open question is missing from the implementation plan.
14. User -> Review and resolve any remaining open questions from Critical Review #3.
15. Agent -> Build each implementation plan.
16. Agent -> Run unit test suite.
17. Agent -> Review unit test results. For each failing test, update the relevant implementation plan, undo the updates to existing files with `git checkout` and delete any new files. Then re-build the updated implementation plan and re-test.



## Components
- Agent Definitions
    - Architect
    - Researcher
    - Developer
    - Critic
    - Test writer
    - Reviser
- Guidelines
    - Specification Guidelines 
- The Compressor - takes markdown files and “compresses” them so they use fewer tokens, improving our context window usage efficiency 
- The Agent - A locally running software process that takes prompts, sends them to the LLM, and returns the response. Agents can spawn other agents, give those child agents prompts, and perform further operations on the response from their spawned agents. Agent processes may need to loop over their processes repeatedly until success criterial are met. Such loops should have hard limits to prevent runaway processes.
- The Database - This is where we store and organize what the user gives us and the tasks we need to perform.
- The MCP Server - this is the bridge between the LLM and the Database.



## What we store in the DB
### Tasks
Tasks are a pyramid of related “to-do’s” starting with the initial problem statement, then child tasks for researching, writing the full spec, reviewing, implementing, etc. Every open question is recorded as a task with the project review as its parent. Every implementation plan is assigned a task, with the implementation catalog as its parent. The parent of the implementation catalog is the specification task, and the specification task’s parent is the epic for the whole project.

Tasks schema
	id
	parent_id	
	type [epic, research, specification, review, catalog, implement, test, question]
	name
	description
	status [new, pending, blocked, done, deferred]
	results
	created_at
	updated_at
	completed_at

### Blockers
Blockers are a table of tasks that block another task. We can’t begin the “Build Implementation Catalog” task until all of the “Open Question” tasks are resolved. 
Blockers Schema
	id
	blocked_task_id
	blocked_by_task_id
	created_at
	updated_at


## The Tasks Hierarchy
Tasks Pyramid example. Each tasks is blocked by all its immediate children and the sibling above it.
Epic
	-> Research
		-> Research current system state
		-> Search web for articles about the problem domain
	-> Compose Spec using research results
	-> Human review and revise loop.
	-> Critical Review #1 Loop (repeat until “review spec” produces no new open questions.
		-> Review spec
		-> Record Open Questions
		-> Answer Open Questions
			-> Open Question 1
			-> Open Question 2
			-> Open Question N…
	-> Create implementation catalog
	-> Build separate implementation plans
    -> Implementation loop
        -> Build Plan 1
        -> Build Plan 2
        -> Build Plan N...
    -> Run Unit Test Suite
    -> Make Unit Test Revisions
        -> update implementation plan to address Unit Test failure 1
            -> rebuild revised implementation plan
            -> retest
	


## Portability and Relations to other project directories
This system needs to be “portable”. We should be able to run it from any directory on the same local system with minimal fuss. This project will define an MCP server that will run locally. That server will need to be started for any of this to work. And the MCP server will need to be made available to all agent definitions. But if we copy our agent definitions into another project, and set up the MCP server configuration in the new project, that should be enough for that project to use the Mike's Agentic Programming System. If we use SQLite as our database, we shouldn’t need docker. 

The Mike's Agentic Programming System will have its own project directory, i.e.
/Users/my_name/projects/MAPS

But the people who will use the Mike's Agentic Programming System will use it on their own projects which will live in separate directories, I.e.:
/Users/my_name/projects/awesome_project
/Users/my_name/projects/excellent_project

The MAPS directory will contain our MCP server. Users will need to start that MCP server from the /Users/my_name/projects/MAPS directory. The MCP server should run locally and should communicate over stdio. The MCP Server needs to be smart enough to start SQLite. The Claude Code CLI process would need to use Claude’s execution tools to run a simple shell command to get the current working directory of the project (i.e. /Users/my_name/projects/awesome_project) and pass that to the MCP Server. The MCP Server would pass that path SQLite to tell it where to create its database file. This way, separate projects get separate databases.

Then users would need to copy our agent definitions and command files (all markdown files for Claude code) into their .claude/ directories. 

Finally, users would need to create an mcp.json file tell Claude where to look for the MCP server.

 



