interface Props {
  message?: string;
}

const FACE = `
      ___________
     /           \\
    |  [o]   [o]  |
    |      _      |
    |    \\___/    |
     \\           /
      \\---------/
          | |
         _|_|_`;

const MATEO = `
   __  ___    ___    ______    ______    ____  
  /  |/  /   /   |  /_  __/  / ____/   / __ \\ 
 / /|_/ /   / /| |   / /    / __/     / / / / 
/ /  / /   / ___ |  / /    / /___    / /_/ /  
/_/  /_/  /_/  |_| /_/    /_____/    \\____/   `;

export default function MateoSplash({ message = "INITIALIZING SYSTEMS..." }: Props) {
  return (
    <div className="min-h-screen bg-cyber-bg flex items-center justify-center">
      <div className="text-cyber-green font-mono flex flex-col items-center select-none">
        <pre className="text-xs leading-tight opacity-80 text-center">{FACE}</pre>
        <pre className="text-xs leading-tight mt-1 text-center">{MATEO}</pre>
        <div className="mt-4 text-xs tracking-[0.3em] opacity-60 text-center">
          MARKET ANALYSIS TERMINAL
        </div>
        <div className="mt-3 text-xs tracking-widest animate-pulse text-center">
          &gt; {message}
        </div>
      </div>
    </div>
  );
}
