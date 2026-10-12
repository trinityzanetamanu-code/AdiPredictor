package adipredictor.production

import java.nio.file.*
import java.security.MessageDigest
import kotlin.io.path.*

fun digest(bytes: ByteArray) =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") {
        "%02x".format(it.toInt() and 255)
    }

fun canonical(path: Path): Path {
    val p = path.toAbsolutePath().normalize()
    return if (p.exists()) p.toRealPath() else canonical(p.parent).resolve(p.fileName)
}

fun files(path: Path): List<Path> {
    if (!path.exists()) return emptyList()
    require(!Files.isSymbolicLink(path)) { "Symlink is not a production boundary: $path" }
    return Files.walk(path).use { stream ->
        stream
            .peek { require(!Files.isSymbolicLink(it)) { "Symlink forbidden: $it" } }
            .filter { Files.isRegularFile(it) }
            .sorted()
            .toList()
    }
}

fun treeHashes(path: Path): Map<String, String> =
    files(path).associate {
        path.relativize(it).toString().replace('\\', '/') to digest(it.readBytes())
    }

fun copyTree(source: Path, destination: Path) {
    destination.createDirectories()
    for (file in files(source)) {
        val target = destination.resolve(source.relativize(file))
        target.parent.createDirectories()
        Files.copy(file, target)
    }
}

fun writeText(path: Path, text: String) {
    path.parent.createDirectories()
    path.writeText(text, Charsets.UTF_8)
}

/** Apply changed files only, without deletion; recover originals if an application fails. */
fun applyTransaction(stage: Path, output: Path, changed: List<String>, backup: Path) {
    val originals =
        changed.associateWith { relative ->
            val p = output.resolve(relative)
            if (p.exists()) p.readBytes() else null
        }
    backup.createDirectories()
    for ((relative, bytes) in originals) if (bytes != null) {
        val p = backup.resolve(relative)
        p.parent.createDirectories()
        p.writeBytes(bytes)
    }
    val applied = mutableListOf<String>()
    try {
        for (relative in changed) {
            val target = output.resolve(relative)
            target.parent.createDirectories()
            val temporary = Files.createTempFile(target.parent, ".prediction-", ".tmp")
            try {
                Files.copy(stage.resolve(relative), temporary, StandardCopyOption.REPLACE_EXISTING)
                java.nio.channels.FileChannel.open(temporary, StandardOpenOption.WRITE).use {
                    it.force(true)
                }
                try {
                    Files.move(
                        temporary,
                        target,
                        StandardCopyOption.ATOMIC_MOVE,
                        StandardCopyOption.REPLACE_EXISTING,
                    )
                } catch (e: AtomicMoveNotSupportedException) {
                    Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING)
                }
                applied += relative
            } finally {
                Files.deleteIfExists(temporary)
            }
        }
    } catch (failure: Exception) {
        for (relative in applied.asReversed()) {
            val target = output.resolve(relative)
            val bytes = originals.getValue(relative)
            if (bytes == null) Files.deleteIfExists(target) else target.writeBytes(bytes)
        }
        throw failure
    }
}
