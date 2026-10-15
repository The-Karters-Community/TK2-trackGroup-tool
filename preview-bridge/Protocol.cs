using System;
using System.Collections.Concurrent;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace TK2.Garage.Preview;

internal sealed class Request
{
    [JsonPropertyName("operation")] public string Operation { get; set; } = "render";
    [JsonPropertyName("view")] public string View { get; set; } = "modded";
    [JsonPropertyName("data")] public JsonElement Data { get; set; }
    [JsonPropertyName("baseline")] public JsonElement Baseline { get; set; }
    [JsonPropertyName("profile")] public string Profile { get; set; } = "";
    [JsonPropertyName("presetId")] public int PresetId { get; set; }
    [JsonPropertyName("rotation")] public float Rotation { get; set; }
    [JsonIgnore] public TaskCompletionSource<object> Result { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
    [JsonIgnore] public DateTime Deadline { get; } = DateTime.UtcNow.AddSeconds(25);
}

internal sealed class PreviewPipe : IDisposable
{
    internal readonly ConcurrentQueue<Request> Queue = new();
    private readonly CancellationTokenSource stop = new();
    internal PreviewPipe() { _ = Task.Run(Serve); }
    private async Task Serve()
    {
        while (!stop.IsCancellationRequested)
        {
            try
            {
                using var pipe = new NamedPipeServerStream("TK2GaragePreview-v1", PipeDirection.InOut, 1,
                    PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await pipe.WaitForConnectionAsync(stop.Token);
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stop.Token);
                timeout.CancelAfter(TimeSpan.FromSeconds(28));
                // Bound before deserialization. No paths, scripts, profile IDs or commands.
                var bytes = new byte[32769]; int count = 0;
                while (count < bytes.Length)
                {
                    int n = await pipe.ReadAsync(bytes.AsMemory(count, 1), timeout.Token);
                    if (n == 0 || bytes[count] == 10) break;
                    count += n;
                }
                if (count >= 32768) throw new InvalidDataException("Preview request too large.");
                var request = JsonSerializer.Deserialize<Request>(Encoding.UTF8.GetString(bytes, 0, count))
                    ?? throw new InvalidDataException("Missing request.");
                if (request.Operation != "status" && request.Operation != "render" && request.Operation != "save-preset")
                    throw new InvalidDataException("Unsupported operation.");
                Queue.Enqueue(request);
                var result = await request.Result.Task.WaitAsync(timeout.Token);
                var response = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(result) + "\n");
                await pipe.WriteAsync(response.AsMemory(), timeout.Token);
                await pipe.FlushAsync(timeout.Token);
            }
            catch (OperationCanceledException) { }
            catch (Exception) { /* A disconnected or malformed client cannot stop later requests. */ }
        }
    }
    public void Dispose() { stop.Cancel(); }
}
