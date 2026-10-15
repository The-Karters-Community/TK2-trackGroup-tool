using System;
using System.Text.Json;
using Il2CppInterop.Runtime;
using Il2CppInterop.Runtime.Attributes;
using UnityEngine;
using UnityEngine.SceneManagement;
using Preset = PTK_ProfileCustomizationPresets.CustomizationPreset;
using UObject = UnityEngine.Object;

namespace TK2.Garage.Preview;

// Unity work stays on its main thread. Never call RenderIcon, EnsurePresetIcon,
// profile mutators or the game's PNG saver: they are not a preview-only API.
public sealed class PreviewHost : MonoBehaviour
{
    public PreviewHost(IntPtr pointer) : base(pointer) { }
    private PreviewPipe? pipe;
    private Request? active;
    private PTK_MenuIconRenderManager? manager;
    private bool oldCameraActive, oldItemActive, oldBackground, oldCustom, oldManual;
    private int readyFrame = -1;
    private Quaternion oldRotation;

    public void Awake()
    {
        oldBackground = Application.runInBackground;
        Application.runInBackground = true;
        pipe = new PreviewPipe();
    }
    [HideFromIl2Cpp]
    private static string? Unavailable()
    {
        if (SceneManager.GetActiveScene().name != "MainMenuScene") return "Open the main menu for live previews.";
        if (PTK_MenuIconRenderManager.Instance == null) return "The game's preview renderer is not ready.";
        return null;
    }
    public void Update()
    {
        try
        {
            if (active != null)
            {
                var reason = Unavailable();
                if (reason != null || DateTime.UtcNow > active.Deadline)
                    Finish(new { ready = false, message = reason ?? "The game took too long to load these appearances." });
                return;
            }
            if (pipe == null || !pipe.Queue.TryDequeue(out var request)) return;
            if (DateTime.UtcNow > request.Deadline)
            {
                request.Result.TrySetResult(new { ready = false, message = "Preview request expired." });
                return;
            }
            var blocked = Unavailable();
            if (request.Operation == "status" || blocked != null)
            {
                request.Result.TrySetResult(new { ready = blocked == null, protocol = 1, message = blocked ?? "Game renderer connected." });
                return;
            }
            var renderer = PTK_MenuIconRenderManager.Instance;
            if (renderer._isRendering || renderer.currentPresetIdsToRender.Count > 0)
            {
                request.Result.TrySetResult(new { ready = false, message = "The game is finishing its own icon renders. Retry shortly." });
                return;
            }
            active = request;
            var preset = BuildPreset(request.Data, request.View);
            manager = renderer; readyFrame = -1;
            oldCameraActive = renderer.cameraRender.activeSelf;
            oldItemActive = renderer.playerIconPreviewItem.gameObject.activeSelf;
            oldCustom = renderer.playerIconPreviewItem.bUseCustomPresetForIconRender;
            oldManual = renderer.playerIconPreviewItem.bDuringManualRotation;
            oldRotation = renderer.playerIconPreviewItem.transform.rotation;
            renderer._isRendering = true; // Short lease prevents its own queue sharing this renderer.
            renderer.playerIconPreviewItem.bUseCustomPresetForIconRender = true;
            renderer.playerIconPreviewItem.gameObject.SetActive(true);
            renderer.cameraRender.SetActive(true);
            var completion = DelegateSupport.ConvertDelegate<Il2CppSystem.Action>((Action)(() => {
                if (!ReferenceEquals(active, request)) return;
                renderer.playerIconPreviewItem.SetManualRotation(true);
                renderer.playerIconPreviewItem.transform.rotation = Quaternion.Euler(0, request.Rotation, 0) * oldRotation;
                readyFrame = Time.frameCount + 3;
            }));
            renderer.playerIconPreviewItem.LoadForIconRender(preset, completion);
        }
        catch (Exception ex)
        {
            if (active != null) Finish(new { ready = false, message = "Game preview failed: " + ex.Message });
        }
    }
    public void LateUpdate()
    {
        if (active == null || manager == null || readyFrame < 0 || Time.frameCount < readyFrame) return;
        if (manager.playerIconPreviewItem.bIsLoadingKartCharOrWheels) return;
        var previous = RenderTexture.active;
        Texture2D? image = null;
        try
        {
            var texture = manager.iconRenderTexture;
            if (texture == null || texture.width > 2048 || texture.height > 2048) throw new InvalidOperationException("Invalid preview texture.");
            RenderTexture.active = texture;
            image = new Texture2D(texture.width, texture.height, TextureFormat.RGBA32, false);
            image.ReadPixels(new Rect(0, 0, texture.width, texture.height), 0, 0);
            image.Apply();
            var png = ImageConversion.EncodeToPNG(image);
            Finish(new { ready = true, protocol = 1, png = Convert.ToBase64String((byte[])png), source = "game" });
        }
        catch (Exception ex) { Finish(new { ready = false, message = "Could not capture preview: " + ex.Message }); }
        finally { RenderTexture.active = previous; if (image != null) UObject.Destroy(image); }
    }
    [HideFromIl2Cpp]
    private static Preset BuildPreset(JsonElement data, string view)
    {
        if (view != "original" && view != "modded") throw new InvalidOperationException("Invalid preview version.");
        var p = new Preset(-1); // Detached temporary object, never registered in the profile.
        p.iCharacterSkinMaterialID = data.GetProperty("iCharacterSkinMaterialID").GetInt32();
        p.iVehicleMaterialID = data.GetProperty("iVehicleMaterialID").GetInt32();
        p.iWheelMaterialID = data.GetProperty("iWheelMaterialID").GetInt32();
        p.iCharacterSkinMaterialID_Modded = data.GetProperty("iCharacterSkinMaterialID_Modded").GetInt32();
        p.iVehicleMaterialID_Modded = data.GetProperty("iVehicleMaterialID_Modded").GetInt32();
        p.iWheelMaterialID_Modded = data.GetProperty("iWheelMaterialID_Modded").GetInt32();
        p.bUsingModdedVersion = view == "modded";
        var config = TK_GameConfig.Data;
        int character = p.bUsingModdedVersion ? p.iCharacterSkinMaterialID_Modded : p.iCharacterSkinMaterialID;
        int vehicle = p.bUsingModdedVersion ? p.iVehicleMaterialID_Modded : p.iVehicleMaterialID;
        int wheels = p.bUsingModdedVersion ? p.iWheelMaterialID_Modded : p.iWheelMaterialID;
        if (!config.characterSkinsMaterial.ContainsConfigID(character) ||
            !config.KartSkins.ContainsConfigID(vehicle) || !config.WheelsMaterial.ContainsConfigID(wheels))
            throw new InvalidOperationException("A selected appearance is not loaded in the game. Install its mod and restart the game.");
        var stickers = data.GetProperty("stickersData");
        if (stickers.GetArrayLength() != 20) throw new InvalidOperationException("Expected twenty sticker slots.");
        for (int i = 0; i < 20; i++)
        {
            var s = stickers[i]; var target = p.stickersData[i];
            target.iStickerMaterialID = s.GetProperty("iStickerMaterialID").GetInt32();
            target.iStickerMaterialID_SettingsPacked = s.GetProperty("iStickerMaterialID_SettingsPacked").GetInt32();
            target.iStickerMaterialID_Modded = s.GetProperty("iStickerMaterialID_Modded").GetInt32();
            target.iStickerMaterialID_Modded_SettingsPacked = s.GetProperty("iStickerMaterialID_Modded_SettingsPacked").GetInt32();
        }
        return p;
    }
    [HideFromIl2Cpp]
    private void Finish(object result)
    {
        var request = active; active = null; readyFrame = -1;
        try
        {
            if (manager != null)
            {
                var item = manager.playerIconPreviewItem;
                item.CancelLoad(); item.SetCustomPresetForIconRender(null); item.DestroyCurrentPreview();
                item.bUseCustomPresetForIconRender = oldCustom;
                item.SetManualRotation(oldManual); item.transform.rotation = oldRotation;
                item.gameObject.SetActive(oldItemActive);
                manager.cameraRender.SetActive(oldCameraActive);
                manager._isRendering = false;
                manager.TryProcessNextJob();
            }
        }
        catch { /* Scene teardown may already have destroyed renderer objects. */ }
        finally { manager = null; request?.Result.TrySetResult(result); }
    }
    public void OnDestroy()
    {
        pipe?.Dispose();
        if (active != null) Finish(new { ready = false, message = "Game renderer closed." });
        Application.runInBackground = oldBackground;
    }
}
