import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Monitor,
  Apple,
  Terminal,
  Copy,
  Check,
  Download,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type Platform = "windows" | "macos" | "linux";

const PLATFORM_LABEL: Record<Platform, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

const PREREQS: Record<
  Platform,
  Array<{ name: string; check: string; install: string; doc?: string }>
> = {
  windows: [
    {
      name: "Node.js 18+",
      check: "node --version",
      install: "winget install OpenJS.NodeJS.LTS",
      doc: "https://nodejs.org/",
    },
    {
      name: "Rust toolchain",
      check: "rustc --version",
      install: "winget install Rustlang.Rustup",
      doc: "https://rustup.rs/",
    },
    {
      name: "Microsoft C++ Build Tools",
      check: "cl",
      install:
        "winget install Microsoft.VisualStudio.2022.BuildTools --override \"--add Microsoft.VisualStudio.Workload.VCTools\"",
      doc: "https://visualstudio.microsoft.com/visual-cpp-build-tools/",
    },
    {
      name: "WebView2 Runtime",
      check: "(Win11 preinstalled)",
      install:
        "winget install Microsoft.EdgeWebView2Runtime",
      doc: "https://developer.microsoft.com/microsoft-edge/webview2/",
    },
  ],
  macos: [
    {
      name: "Node.js 18+",
      check: "node --version",
      install: "brew install node",
      doc: "https://nodejs.org/",
    },
    {
      name: "Rust toolchain",
      check: "rustc --version",
      install: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
      doc: "https://rustup.rs/",
    },
    {
      name: "Xcode Command Line Tools",
      check: "xcode-select -p",
      install: "xcode-select --install",
    },
  ],
  linux: [
    {
      name: "Node.js 18+",
      check: "node --version",
      install: "curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt install -y nodejs",
      doc: "https://nodejs.org/",
    },
    {
      name: "Rust toolchain",
      check: "rustc --version",
      install: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
      doc: "https://rustup.rs/",
    },
    {
      name: "WebKitGTK & build deps",
      check: "pkg-config --exists webkit2gtk-4.1",
      install:
        "sudo apt install -y libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev build-essential curl wget file",
    },
  ],
};

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "windows";
  const p = navigator.platform.toLowerCase();
  const ua = navigator.userAgent.toLowerCase();
  if (p.includes("mac") || ua.includes("mac os")) return "macos";
  if (p.includes("linux") || ua.includes("linux")) return "linux";
  return "windows";
}

const BUILD_STEPS: Array<{ title: string; cmd: string; note?: string }> = [
  {
    title: "১. সোর্স কোড ডাউনলোড করুন",
    cmd: "git clone <your-repo-url> apple-store-pos\ncd apple-store-pos",
    note: "GitHub থেকে Lovable প্রজেক্ট sync করার পর ক্লোন করুন।",
  },
  {
    title: "২. ডিপেন্ডেন্সি ইনস্টল করুন",
    cmd: "npm install\nnpm install --save-dev @tauri-apps/cli@^2",
  },
  {
    title: "৩. অ্যাপ আইকন জেনারেট করুন",
    cmd: "npx tauri icon ./public/lovable-uploads/3926e988-d85b-4bf1-8f3e-71bdbe4a2e70.png",
    note: "একবারই দরকার — সব প্ল্যাটফর্মের আইকন তৈরি হবে।",
  },
  {
    title: "৪. ডেভ মোডে চালান (ঐচ্ছিক)",
    cmd: "npx tauri dev",
    note: "Hot-reload সহ ডেস্কটপ উইন্ডোতে অ্যাপ খুলবে।",
  },
  {
    title: "৫. প্রোডাকশন ইনস্টলার বিল্ড করুন",
    cmd: "npx tauri build",
    note: "আউটপুট: src-tauri/target/release/bundle/",
  },
];

const OUTPUT_PATHS: Record<Platform, string[]> = {
  windows: [
    "src-tauri/target/release/bundle/msi/Apple Store_1.0.0_x64_en-US.msi",
    "src-tauri/target/release/bundle/nsis/Apple Store_1.0.0_x64-setup.exe",
  ],
  macos: [
    "src-tauri/target/release/bundle/dmg/Apple Store_1.0.0_aarch64.dmg",
    "src-tauri/target/release/bundle/macos/Apple Store.app",
  ],
  linux: [
    "src-tauri/target/release/bundle/appimage/apple-store-pos_1.0.0_amd64.AppImage",
    "src-tauri/target/release/bundle/deb/apple-store-pos_1.0.0_amd64.deb",
  ],
};

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("ক্লিপবোর্ডে কপি হয়েছে");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("কপি ব্যর্থ");
    }
  };
  return (
    <div className="relative group">
      <pre className="bg-muted/60 border border-border rounded-md p-3 pr-12 text-xs font-mono whitespace-pre-wrap break-all">
        {text}
      </pre>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="absolute top-1.5 right-1.5 h-7 w-7 p-0"
        onClick={handleCopy}
        aria-label="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

export function DesktopBuildWizard() {
  const detected = useMemo(detectPlatform, []);
  const [platform, setPlatform] = useState<Platform>(detected);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 w-full md:w-auto">
          <Download className="h-4 w-4" />
          ডেস্কটপ অ্যাপ বিল্ড করুন
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            ডেস্কটপ অ্যাপ বিল্ড উইজার্ড
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-4 py-2">
            <Card className="p-4 bg-amber-500/5 border-amber-500/30">
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-foreground">
                  বিল্ড আপনার নিজের কম্পিউটারে চালাতে হবে — Lovable preview-এ
                  সরাসরি ইনস্টলার তৈরি সম্ভব নয়। নিচের ধাপগুলি অনুসরণ করুন।
                </p>
              </div>
            </Card>

            <Tabs value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="windows" className="gap-2">
                  <Monitor className="h-4 w-4" />
                  Windows
                </TabsTrigger>
                <TabsTrigger value="macos" className="gap-2">
                  <Apple className="h-4 w-4" />
                  macOS
                </TabsTrigger>
                <TabsTrigger value="linux" className="gap-2">
                  <Terminal className="h-4 w-4" />
                  Linux
                </TabsTrigger>
              </TabsList>

              {(["windows", "macos", "linux"] as Platform[]).map((p) => (
                <TabsContent key={p} value={p} className="space-y-4 mt-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">
                      প্রয়োজনীয়তা — {PLATFORM_LABEL[p]}
                    </h3>
                    {detected === p && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <CheckCircle2 className="h-3 w-3" />
                        আপনার সিস্টেম
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-3">
                    {PREREQS[p].map((r) => (
                      <Card key={r.name} className="p-3 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="font-medium text-sm text-foreground">{r.name}</p>
                          {r.doc && (
                            <a
                              href={r.doc}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                            >
                              ডকুমেন্টেশন
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            যাচাই করুন:
                          </p>
                          <CopyBlock text={r.check} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">ইনস্টল কমান্ড:</p>
                          <CopyBlock text={r.install} />
                        </div>
                      </Card>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-border space-y-3">
                    <h3 className="font-semibold text-foreground">
                      বিল্ড ধাপসমূহ
                    </h3>
                    {BUILD_STEPS.map((s) => (
                      <div key={s.title} className="space-y-1.5">
                        <p className="text-sm font-medium text-foreground">
                          {s.title}
                        </p>
                        <CopyBlock text={s.cmd} />
                        {s.note && (
                          <p className="text-xs text-muted-foreground">{s.note}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <Card className="p-3 bg-primary/5 border-primary/30">
                    <p className="text-sm font-semibold text-foreground mb-2">
                      আউটপুট ফাইল ({PLATFORM_LABEL[p]})
                    </p>
                    <ul className="text-xs font-mono space-y-1 text-muted-foreground">
                      {OUTPUT_PATHS[p].map((path) => (
                        <li key={path} className="break-all">
                          • {path}
                        </li>
                      ))}
                    </ul>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>

            <Card className="p-3 text-xs text-muted-foreground">
              বিস্তারিত গাইড: প্রজেক্টের রুটে{" "}
              <code className="font-mono text-foreground">TAURI_BUILD.md</code>{" "}
              ফাইল দেখুন।
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}