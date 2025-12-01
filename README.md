# Devlog Entry - 11/12

## Introducing the team
- **Wendy Zhang** - Design Lead and Tools Lead
- **Taylor Pearce** - Engine Lead and Testing Lead

## Tools and Materials

### Engine
Phaser 3: We decided to use Phaser because we have familiarity with it and find it fairly simple and easy to use. It also has a plugin that can enable 3d capabitlities.

three.js: As we are using phaser, the easiest way to implement 3d is by using three.js. It is easy to learn and already has a very well established library with lots of examples. 

Cannon.js: Because we are using three.js, we figured that it would be smart to use cannon as it is very complimentary to three.js. Cannon will be the engine that gives us our physics and 3d world.

### Language
Javascript: We decided on using javascript as it is the language we are most familiar with and it works very well with all of our engines and libraries. 

CSS: We don't know exactly how much we will be using CSS but figured it might be good to have for style purposes similar to all of our projects thus far.

JSON: Because we are using Javascript, it made the most sense to use JSON as our data language.

### Tools
CodeSpaces: We decided that using Codespaces made the most sense because we have been using it all quarter and it has good collaborative capabilities.

GitHub Actions: We will be using GitHub Actions as our workflow because it is automated and something we are familiar with using.

Vite: For our build tool we will be using Vite as we have familarity and it is compatible with all of our languages and engines. 

Blender: For our 3d editor, we decided on using blender. We chose this because it is a free tool with a very established community and it works with all of our other tools and engines.

### Generative AI
Claude: While we are not super familiar with Claude, we think it might be a good tool to use for this project as it is a code based LLM. And although it has agentic abilities, we will probably just stick to using it as an LLM.

Copilot: Contrary to Claude, we have more experience with Copilot and will most likely be using its agentic qualities. Specifically, we will be giving very explecit instructions as to not have it code the entire game.


## Outlook
For this project we want to focus on making the 3d aspects as polished as possible. However, this is also going to be the hardest part as we have little to no experience with 3d rendering. This is also inherently risky as without much knowledge, it is going to be difficult to get the 3d aspects as polished as we want them to be. We hope that by focusing on these aspects that we are unfamiliar with, that we learn a lot of valuable information and skills when it comes to using 3d aspects in games.

# Devlog Entry - 11/21

## How we satisfied the software requirements
Our prototype is built as a browser based JavaScript project using Vite as the bundler and dev server and then adding Three.js for rendering and cannon-es for physics. We used Blender to create the model to import and all of the rendering and physics behavior you see in the game scene setup, camera, lighting, meshes, rigid-body dynamics, collision, and forces, is implemented explicitly through the external libraries we import in src/main.js. Our F1 is a simple parkour/puzzle game where the player plays as a little ball that must hop across a path and then push a block from one point to another in order to unlock the final path that leads to the goal. Finally, we implemented required automation: pre commit hooks that run linting, typechecking, and builds before allowing commits, and GitHub Actions workflows that automatically build and deploy the game, generate screenshots using a headless browser, and run basic interaction tests after each push, and is pushed to a github pages using github actions.

## Reflection
Looking back, we were way too amitious when we first started. We had a much more complex 3d model that was inspired by the escherian stairs. We quickly realized that with little 3d experience, this is very complicated first project. We had a lot of trouble with collision and figuring out the new engines on such a complicated model. Instead, we pivoted to a much more simple game and focused on the mechanic requirements rather than the aesthetics. As for roles, they stayed the same but we did help each other if needed. 

# Devlog Entry - 12/1

## How we satisfied the software requirements
Our project continues to use the same technologies defined in F1: Three.js for rendering and Cannon-es for physics simulation. The game includes two separate scenes (Room 1 and Room 2), each defined by its own GLB file. When the player reaches the goal platform in Room 1, a transition function removes all Room 1 objects and physics bodies before loading the second GLB model and generating new colliders and interactions. Player interaction is implemented through raycasting, allowing objects such as the key in Room 1, the power box in Room 2, and the activation plate to respond to pointer clicks. Clicking the key removes it from the world and adds it to the inventory, and possession of the key directly affects later gameplay; the power box cannot be activated unless the key has been collected. This ensures that actions in one scene meaningfully influence what is possible in another. The physics puzzle is entirely skill based where the player must push the cube with proper positioning and force, avoiding knocking it off or trapping it, ensuring that success depends on player reasoning and control rather than luck.

## Reflection
Looking back on our development process, our team’s approach changed significantly since F1. Early on, we were overly ambitious and realized halfway through that our original ideas were unrealistic given our experience and the project timeline. Learning from that, we chose to simplify our goals for this project and focus on building something achievable and stable. This shift allowed us to work more efficiently, understand our tools better, and ultimately deliver a complete game that still meets all the project requirements.