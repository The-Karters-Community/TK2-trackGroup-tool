using System;
using System.IO;
using BepInEx;
using BepInEx.Unity.IL2CPP;

namespace TK2.Garage.Preview;

[BepInPlugin("community.tk2.garage.preview", "TK2 Garage preview companion", "0.1.0")]
public sealed class Plugin : BasePlugin
{
    public override void Load()
    {
        var info = Path.Combine(Paths.GameRootPath, "build-info.txt");
        if (!File.Exists(info) || !File.ReadAllText(info).Replace("\r\n", "\n").Contains("Version: 0.1.4.18\n"))
            throw new NotSupportedException("Preview companion supports TK2 0.1.4.18 only.");
        AddComponent<PreviewHost>();
        Log.LogInfo("Garage preview companion ready. Local current-user pipe; main menu only; no preset/save writes.");
    }
}
