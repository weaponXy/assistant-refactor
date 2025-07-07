var builder = WebApplication.CreateBuilder(args);

// ✅ Add this line to register CORS
builder.Services.AddCors();

var app = builder.Build();

app.UseCors(policy => policy
    .AllowAnyOrigin()
    .AllowAnyHeader()
    .AllowAnyMethod());

app.MapGet("/api/hello", () => new { message = "Hello from C#!" });

app.Run();
